package dev.seanward.site.api;

import dev.seanward.site.store.SiteStore;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Private feedback on a post. Stored for Sean to read; never shown on the site. */
@RestController
public class FeedbackController {

    public record FeedbackRequest(
            @NotBlank @Size(max = 100) String slug,
            @NotBlank @Size(min = 2, max = 2000) String message,
            @Size(max = 80) String name,
            @Size(max = 200) String website,
            @Size(max = 2048) String token) {}

    private final SiteStore store;
    private final PostCatalog posts;
    private final RateLimiter limiter;
    private final ClientKeys keys;
    private final TurnstileVerifier turnstile;

    public FeedbackController(SiteStore store, PostCatalog posts, RateLimiter limiter, ClientKeys keys, TurnstileVerifier turnstile) {
        this.store = store;
        this.posts = posts;
        this.limiter = limiter;
        this.keys = keys;
        this.turnstile = turnstile;
    }

    @PostMapping("/api/feedback")
    public ResponseEntity<Map<String, String>> send(@Valid @RequestBody FeedbackRequest body, HttpServletRequest request) {
        if (!posts.exists(body.slug())) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not_found"));
        // A filled honeypot means a bot: answer as if it worked and keep nothing.
        if (body.website() != null && !body.website().isBlank()) return ResponseEntity.accepted().body(Map.of("status", "sent"));
        if (!limiter.allow("feedback:" + keys.keyFor(request), 5, Duration.ofHours(1))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "too_many"));
        }
        if (!turnstile.verify(body.token(), ClientKeys.clientIp(request))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "bot_check_failed"));
        }
        store.saveFeedback(new SiteStore.Feedback(body.slug(), clean(body.message()), body.name() == null ? "" : clean(body.name()), Instant.now()));
        return ResponseEntity.accepted().body(Map.of("status", "sent"));
    }

    /** Keeps printable text and line breaks only. */
    static String clean(String s) {
        return s.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").strip();
    }
}
