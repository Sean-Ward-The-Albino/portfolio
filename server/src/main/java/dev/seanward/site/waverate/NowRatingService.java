package dev.seanward.site.waverate;

import dev.seanward.site.SiteProperties;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Sean's latest Waverate ratings, from the Waverate Data API on Avlory's identity gateway.
 *
 * <p>The API key stays on this server. Results are cached for ten minutes, and the last good answer is kept and
 * served if Waverate can't be reached. Album art comes from Apple's public iTunes Search API, since the ratings
 * themselves don't carry it.
 */
@Service
@RegisterReflectionForBinding({NowRatingService.Rating.class, NowRatingService.RatingsResponse.class, NowRatingService.RawRating.class})
public class NowRatingService {

    private static final Logger log = LoggerFactory.getLogger(NowRatingService.class);
    private static final Duration FRESH = Duration.ofMinutes(10);
    private static final int MAX_ART = 500;

    public record Rating(String title, String artist, String album, double value, String ratedAt, String artwork) {}

    record RawRating(String songId, String title, String artistName, String albumTitle, Double value, String ratedAt) {}

    record RatingsResponse(String userId, List<RawRating> ratings) {}

    private final SiteProperties.Waverate config;
    private final RestClient waverate;
    private final RestClient itunes;
    private final Map<String, String> artwork = java.util.Collections.synchronizedMap(new LinkedHashMap<>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
            return size() > MAX_ART;
        }
    });
    private volatile List<Rating> cached = List.of();
    private volatile Instant cachedAt = Instant.EPOCH;

    public NowRatingService(SiteProperties props, RestClient.Builder builder) {
        this.config = props.waverate();
        this.waverate = config != null && config.configured() ? builder.clone().baseUrl(config.baseUrl()).build() : null;
        this.itunes = builder.clone().baseUrl("https://itunes.apple.com").build();
    }

    public Optional<List<Rating>> latest() {
        if (waverate == null) return Optional.empty();
        if (Instant.now().isBefore(cachedAt.plus(FRESH))) return Optional.of(cached);
        synchronized (this) {
            if (Instant.now().isBefore(cachedAt.plus(FRESH))) return Optional.of(cached);
            try {
                RatingsResponse res = waverate.get()
                        .uri("/api/v1/waverate/users/{uid}/ratings?limit=8", config.userId())
                        .header("X-API-Key", config.apiKey())
                        .retrieve().body(RatingsResponse.class);
                List<Rating> fresh = new ArrayList<>();
                for (RawRating r : res == null || res.ratings() == null ? List.<RawRating>of() : res.ratings()) {
                    if (r.title() == null || r.value() == null) continue;
                    fresh.add(new Rating(r.title(), r.artistName(), r.albumTitle(), r.value(), r.ratedAt(), art(r)));
                }
                cached = List.copyOf(fresh);
            } catch (RuntimeException e) {
                // Keep serving the last good list; try again after the next window.
                log.warn("Waverate ratings unavailable: {}", e.getClass().getSimpleName());
            }
            cachedAt = Instant.now();
            return Optional.of(cached);
        }
    }

    private String art(RawRating r) {
        String key = r.songId() != null ? r.songId() : r.artistName() + "|" + r.title();
        return artwork.computeIfAbsent(key, k -> {
            try {
                Map<?, ?> found = itunes.get()
                        .uri(u -> u.path("/search").queryParam("term", r.artistName() + " " + r.title()).queryParam("entity", "song").queryParam("limit", 1).build())
                        .retrieve().body(Map.class);
                if (found != null && found.get("results") instanceof List<?> list && !list.isEmpty() && list.getFirst() instanceof Map<?, ?> first) {
                    Object url = first.get("artworkUrl100");
                    if (url instanceof String s && s.startsWith("https://")) return s.replace("100x100bb", "300x300bb");
                }
            } catch (RuntimeException e) {
                log.debug("No artwork for a rating: {}", e.getClass().getSimpleName());
            }
            return "";
        });
    }
}
