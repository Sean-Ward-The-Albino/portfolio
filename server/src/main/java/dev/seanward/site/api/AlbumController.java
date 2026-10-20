package dev.seanward.site.api;

import dev.seanward.site.store.SiteStore;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

/**
 * "Rate it like Waverate" on the Craft world: find any album, give it a score from 0.00 to 10.00, and see how other
 * visitors rated it. Search goes through Apple's public iTunes Search API from this server, so visitors' browsers
 * only ever talk to this site.
 */
@RestController
public class AlbumController {

    private static final Logger log = LoggerFactory.getLogger(AlbumController.class);
    private static final Pattern ALBUM_ID = Pattern.compile("^[0-9]{1,15}$");

    public record Album(String id, String title, String artist, String year, String artwork) {}

    public record RateRequest(@NotNull @DecimalMin("0.00") @DecimalMax("10.00") Double score) {}

    private final SiteStore store;
    private final RateLimiter limiter;
    private final ClientKeys keys;
    private final RestClient itunes;
    private final Map<String, List<Album>> searches = Collections.synchronizedMap(new LinkedHashMap<>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, List<Album>> eldest) {
            return size() > 300;
        }
    });

    public AlbumController(SiteStore store, RateLimiter limiter, ClientKeys keys, RestClient.Builder builder) {
        this.store = store;
        this.limiter = limiter;
        this.keys = keys;
        this.itunes = builder.clone().baseUrl("https://itunes.apple.com").build();
    }

    @GetMapping("/api/albums/search")
    public ResponseEntity<?> search(@RequestParam String q, HttpServletRequest request) {
        String term = TextRules.oneLine(q);
        if (term.length() < 2 || term.length() > 80) return ResponseEntity.badRequest().body(Map.of("error", "bad_query"));
        if (!limiter.allow("search:" + keys.keyFor(request), 30, Duration.ofMinutes(1))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "too_many"));
        }
        String key = term.toLowerCase(Locale.ROOT);
        List<Album> found = searches.get(key);
        if (found == null) {
            found = lookUp(key);
            // Only remember answers that worked, so a brief outage isn't cached as "nothing found"
            if (found == null) return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", "search_unavailable"));
            searches.put(key, found);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic()).body(Map.of("albums", found));
    }

    private List<Album> lookUp(String term) {
        try {
            Map<?, ?> res = itunes.get()
                    .uri(u -> u.path("/search").queryParam("term", term).queryParam("entity", "album").queryParam("limit", 8).build())
                    .retrieve().body(Map.class);
            List<Album> out = new ArrayList<>();
            if (res != null && res.get("results") instanceof List<?> list) {
                for (Object o : list) {
                    if (!(o instanceof Map<?, ?> m) || m.get("collectionId") == null) continue;
                    String art = m.get("artworkUrl100") instanceof String s && s.startsWith("https://") ? s.replace("100x100bb", "300x300bb") : "";
                    String date = m.get("releaseDate") instanceof String d && d.length() >= 4 ? d.substring(0, 4) : "";
                    out.add(new Album(String.valueOf(m.get("collectionId")), str(m.get("collectionName")), str(m.get("artistName")), date, art));
                }
            }
            return List.copyOf(out);
        } catch (RuntimeException e) {
            log.warn("Album search failed: {}", e.getClass().getSimpleName());
            return null;
        }
    }

    private static String str(Object o) {
        return o == null ? "" : TextRules.oneLine(o.toString());
    }

    @GetMapping("/api/albums/{id}")
    public ResponseEntity<?> stats(@PathVariable String id) {
        if (!ALBUM_ID.matcher(id).matches()) return ResponseEntity.badRequest().body(Map.of("error", "bad_id"));
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(store.albumStats(id));
    }

    @PostMapping("/api/albums/{id}/rating")
    public ResponseEntity<?> rate(@PathVariable String id, @Valid @RequestBody RateRequest body, HttpServletRequest request) {
        if (!ALBUM_ID.matcher(id).matches()) return ResponseEntity.badRequest().body(Map.of("error", "bad_id"));
        // One rating per album per visitor per day; more just returns the totals.
        if (!limiter.allow("rate:" + id + ":" + keys.keyFor(request), 1, Duration.ofDays(1))) return ResponseEntity.ok(store.albumStats(id));
        double score = Math.round(body.score() * 100) / 100.0;
        return ResponseEntity.ok(store.rate(id, score));
    }
}
