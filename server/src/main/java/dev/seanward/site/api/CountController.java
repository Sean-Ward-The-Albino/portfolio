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
import org.springframework.web.bind.annotation.RestController;

/** Site-wide counts for the things visitors do: lattes brewed, steaks cooked, puzzles solved, coaster rides. */
@RestController
public class CountController {

    static final Set<String> NAMES = Set.of("latte", "steak-medium-rare", "steak-other", "puzzle", "coaster", "opening");

    private final SiteStore store;
    private final RateLimiter limiter;
    private final ClientKeys keys;

    public CountController(SiteStore store, RateLimiter limiter, ClientKeys keys) {
        this.store = store;
        this.limiter = limiter;
        this.keys = keys;
    }

    @GetMapping("/api/counts")
    public ResponseEntity<Map<String, Long>> counts() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(10))).body(store.counts());
    }

    @PostMapping("/api/counts/{name}")
    public ResponseEntity<?> add(@PathVariable String name, HttpServletRequest request) {
        if (!NAMES.contains(name)) return ResponseEntity.notFound().build();
        // Counts are for fun, but keep one visitor from inflating them: a few per name per hour
        if (!limiter.allow("count:" + name + ":" + keys.keyFor(request), 6, Duration.ofHours(1))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("count", store.counts().getOrDefault(name, 0L)));
        }
        return ResponseEntity.ok(Map.of("count", store.increment(name)));
    }
}
