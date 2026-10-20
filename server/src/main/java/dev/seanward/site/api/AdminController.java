package dev.seanward.site.api;

import dev.seanward.site.store.SiteStore;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
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
 * <p>See {@link AdminAuth} for how the token is checked.
 */
@RestController
public class AdminController {

    private static final int MAX_CONTENT_CHARS = 400_000;

    private final SiteStore store;
    private final ContentController.Content content;
    private final GameController game;
    private final AdminAuth auth;

    public AdminController(SiteStore store, ContentController.Content content, GameController game, AdminAuth auth) {
        this.store = store;
        this.content = content;
        this.game = game;
        this.auth = auth;
    }

    private ResponseEntity<Map<String, String>> deny(String token, HttpServletRequest request) {
        return auth.deny(token, request);
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
