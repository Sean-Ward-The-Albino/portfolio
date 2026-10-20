package dev.seanward.site.api;

import dev.seanward.site.SiteProperties;
import dev.seanward.site.store.SiteStore;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * The admin panel's API: edit the words on every world, read feedback, and remove lanterns from the Game planet.
 * Every call needs the admin token in the {@code Authorization: Bearer} header.
 *
 * <p>The token comes from {@code ADMIN_TOKEN}. Without it, a random token is made at startup and printed to the log,
 * which is fine for running locally. Sign-in with Avlory ID can replace this later.
 */
@RestController
public class AdminController {

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);
    private static final int MAX_CONTENT_CHARS = 400_000;

    private final SiteStore store;
    private final ContentController.Content content;
    private final GameController game;
    private final RateLimiter limiter;
    private final ClientKeys keys;
    private final byte[] token;

    public AdminController(SiteStore store, ContentController.Content content, GameController game, RateLimiter limiter, ClientKeys keys, SiteProperties props) {
        this.store = store;
        this.content = content;
        this.game = game;
        this.limiter = limiter;
        this.keys = keys;
        String configured = props.admin() == null ? null : props.admin().token();
        if (configured == null || configured.isBlank()) {
            byte[] random = new byte[18];
            new SecureRandom().nextBytes(random);
            configured = HexFormat.of().formatHex(random);
            log.info("No ADMIN_TOKEN set. Admin token for this run: {}", configured);
        }
        this.token = configured.getBytes(StandardCharsets.UTF_8);
    }

    private ResponseEntity<Map<String, String>> deny(String auth, HttpServletRequest request) {
        if (!limiter.allow("admin:" + keys.keyFor(request), 60, Duration.ofMinutes(1))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "too_many"));
        }
        String given = auth != null && auth.startsWith("Bearer ") ? auth.substring(7) : "";
        // Constant-time comparison, so the token can't be guessed from response times.
        if (!MessageDigest.isEqual(token, given.getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "unauthorized"));
        }
        return null;
    }

    @GetMapping("/api/admin/content")
    public ResponseEntity<?> getContent(@RequestHeader(value = "Authorization", required = false) String auth, HttpServletRequest req) {
        var no = deny(auth, req);
        return no != null ? no : ResponseEntity.ok(content.current());
    }

    @PutMapping("/api/admin/content")
    public ResponseEntity<?> putContent(@RequestHeader(value = "Authorization", required = false) String auth, @RequestBody Map<String, Object> body, HttpServletRequest req) {
        var no = deny(auth, req);
        if (no != null) return no;
        if (!(body.get("worlds") instanceof Map<?, ?>) || body.toString().length() > MAX_CONTENT_CHARS) {
            return ResponseEntity.badRequest().body(Map.of("error", "content_must_have_worlds"));
        }
        store.saveContent(body);
        return ResponseEntity.ok(Map.of("status", "saved"));
    }

    @DeleteMapping("/api/admin/content")
    public ResponseEntity<?> resetContent(@RequestHeader(value = "Authorization", required = false) String auth, HttpServletRequest req) {
        var no = deny(auth, req);
        if (no != null) return no;
        store.saveContent(content.starting());
        return ResponseEntity.ok(Map.of("status", "reset"));
    }

    @GetMapping("/api/admin/feedback")
    public ResponseEntity<?> feedback(@RequestHeader(value = "Authorization", required = false) String auth, HttpServletRequest req) {
        var no = deny(auth, req);
        if (no != null) return no;
        List<SiteStore.Feedback> all = store.feedback();
        return ResponseEntity.ok(Map.of("feedback", all.reversed()));
    }

    @DeleteMapping("/api/admin/feedback/{id}")
    public ResponseEntity<?> deleteFeedback(@RequestHeader(value = "Authorization", required = false) String auth, @PathVariable String id, HttpServletRequest req) {
        var no = deny(auth, req);
        if (no != null) return no;
        return store.deleteFeedback(id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @GetMapping("/api/admin/marks")
    public ResponseEntity<?> marks(@RequestHeader(value = "Authorization", required = false) String auth, HttpServletRequest req) {
        var no = deny(auth, req);
        return no != null ? no : ResponseEntity.ok(Map.of("marks", store.marks().reversed()));
    }

    @DeleteMapping("/api/admin/marks/{id}")
    public ResponseEntity<?> deleteMark(@RequestHeader(value = "Authorization", required = false) String auth, @PathVariable String id, HttpServletRequest req) {
        var no = deny(auth, req);
        if (no != null) return no;
        if (!store.deleteMark(id)) return ResponseEntity.notFound().build();
        game.removed(id);
        return ResponseEntity.noContent().build();
    }
}
