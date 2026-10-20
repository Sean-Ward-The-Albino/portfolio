package dev.seanward.site.api;

import dev.seanward.site.store.SiteStore;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Private messages to Sean from the Feedback beacon. Stored for the admin panel; never shown on the site. */
@RestController
public class FeedbackController {

    public record FeedbackRequest(
            @NotBlank @Size(min = 2, max = 2000) String message,
            @Size(max = 80) String name,
            @Size(max = 200) String website,
            @Size(max = 2048) String token) {}

    private final SiteStore store;
    private final RateLimiter limiter;
    private final ClientKeys keys;
    private final TurnstileVerifier turnstile;

    public FeedbackController(SiteStore store, RateLimiter limiter, ClientKeys keys, TurnstileVerifier turnstile) {
        this.store = store;
        this.limiter = limiter;
        this.keys = keys;
        this.turnstile = turnstile;
    }

    @PostMapping("/api/feedback")
    public ResponseEntity<Map<String, String>> send(@Valid @RequestBody FeedbackRequest body, HttpServletRequest request) {
        // A filled honeypot means a bot: answer as if it worked and keep nothing.
        if (body.website() != null && !body.website().isBlank()) return ResponseEntity.accepted().body(Map.of("status", "sent"));
        if (!limiter.allow("feedback:" + keys.keyFor(request), 5, Duration.ofHours(1))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "too_many"));
        }
        if (!turnstile.verify(body.token(), ClientKeys.clientIp(request))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "bot_check_failed"));
        }
        store.saveFeedback(new SiteStore.Feedback(UUID.randomUUID().toString(), TextRules.clean(body.message()), TextRules.oneLine(body.name()), Instant.now()));
        return ResponseEntity.accepted().body(Map.of("status", "sent"));
    }
}
