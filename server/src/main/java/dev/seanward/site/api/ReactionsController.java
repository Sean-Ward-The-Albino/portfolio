package dev.seanward.site.api;

import dev.seanward.site.store.SiteStore;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Reactions on posts: no accounts and no cookies. One of each kind per visitor per post per day. */
@RestController
@RequestMapping("/api/reactions")
public class ReactionsController {

    static final Set<String> KINDS = Set.of("resonates", "think", "disagree");

    private final SiteStore store;
    private final PostCatalog posts;
    private final RateLimiter limiter;
    private final ClientKeys keys;

    public ReactionsController(SiteStore store, PostCatalog posts, RateLimiter limiter, ClientKeys keys) {
        this.store = store;
        this.posts = posts;
        this.limiter = limiter;
        this.keys = keys;
    }

    @GetMapping("/{slug}")
    public ResponseEntity<Map<String, Long>> counts(@PathVariable String slug) {
        if (!posts.exists(slug)) return ResponseEntity.notFound().build();
        // Browsers always ask again (so your own reaction shows after a reload); Cloudflare may share a copy for 15 seconds.
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ZERO).cachePublic().sMaxAge(Duration.ofSeconds(15))).body(store.reactions(slug));
    }

    @PostMapping("/{slug}/{kind}")
    public ResponseEntity<Map<String, Long>> react(@PathVariable String slug, @PathVariable String kind, HttpServletRequest request) {
        if (!posts.exists(slug) || !KINDS.contains(kind)) return ResponseEntity.notFound().build();
        String client = keys.keyFor(request);
        if (!limiter.allow("react:" + client, 60, Duration.ofHours(1))) return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        if (!limiter.allow("react:" + client + ":" + slug + ":" + kind, 1, Duration.ofDays(1))) {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(store.reactions(slug));
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(store.addReaction(slug, kind));
    }
}
