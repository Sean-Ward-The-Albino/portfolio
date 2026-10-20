package dev.seanward.site.api;

import dev.seanward.site.store.SiteStore;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * The Game planet: the one place visitors share. Anyone can leave a lantern with a short note; everyone sees them,
 * live, along with how many people are on the planet right now. Everywhere else, what a visitor does stays in their
 * own browser.
 */
@RestController
@EnableScheduling
public class GameController {

    public record MarkRequest(
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double lat,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double lon,
            @NotBlank @Size(max = 60) String note,
            @NotBlank @Pattern(regexp = "^#[0-9a-fA-F]{6}$") String color,
            @Size(max = 200) String website) {}

    private final SiteStore store;
    private final RateLimiter limiter;
    private final ClientKeys keys;
    private final List<SseEmitter> listeners = new CopyOnWriteArrayList<>();

    public GameController(SiteStore store, RateLimiter limiter, ClientKeys keys) {
        this.store = store;
        this.limiter = limiter;
        this.keys = keys;
    }

    @GetMapping("/api/game/marks")
    public ResponseEntity<Map<String, Object>> marks() {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(Map.of("marks", store.marks(), "here", listeners.size()));
    }

    @PostMapping("/api/game/marks")
    public ResponseEntity<?> add(@Valid @RequestBody MarkRequest body, HttpServletRequest request) {
        if (body.website() != null && !body.website().isBlank()) return ResponseEntity.accepted().body(Map.of("status", "added"));
        String note = TextRules.oneLine(body.note());
        if (note.isEmpty() || TextRules.hasLink(note) || TextRules.blocked(note)) {
            return ResponseEntity.unprocessableContent().body(Map.of("error", "note_not_allowed"));
        }
        if (!limiter.allow("mark:" + keys.keyFor(request), 3, Duration.ofHours(1))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "too_many"));
        }
        SiteStore.Mark mark = new SiteStore.Mark(UUID.randomUUID().toString(), body.lat(), body.lon(), note, body.color().toLowerCase(), Instant.now());
        store.addMark(mark);
        broadcast("mark", mark);
        return ResponseEntity.status(HttpStatus.CREATED).body(mark);
    }

    /** Live updates: new lanterns and the number of people on the planet. */
    @GetMapping(path = "/api/game/live", produces = "text/event-stream")
    public SseEmitter live() {
        SseEmitter emitter = new SseEmitter(Duration.ofMinutes(30).toMillis());
        if (listeners.size() >= 500) {
            emitter.complete();
            return emitter;
        }
        listeners.add(emitter);
        emitter.onCompletion(() -> leave(emitter));
        emitter.onTimeout(() -> leave(emitter));
        emitter.onError(e -> leave(emitter));
        broadcast("here", listeners.size());
        return emitter;
    }

    /** Called by the admin panel after removing a lantern, so it disappears for everyone. */
    void removed(String id) {
        broadcast("removed", id);
    }

    private void leave(SseEmitter emitter) {
        if (listeners.remove(emitter)) broadcast("here", listeners.size());
    }

    private void broadcast(String event, Object data) {
        for (SseEmitter e : listeners) {
            try {
                e.send(SseEmitter.event().name(event).data(data));
            } catch (IOException | IllegalStateException ex) {
                listeners.remove(e);
            }
        }
    }

    /** Keeps connections open through proxies that drop quiet ones. */
    @Scheduled(fixedRate = 25_000)
    void ping() {
        broadcast("ping", "");
    }
}
