package dev.seanward.site.api;

import dev.seanward.site.waverate.NowRatingService;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NowController {

    private final NowRatingService ratings;

    public NowController(NowRatingService ratings) {
        this.ratings = ratings;
    }

    /** 204 when Waverate isn't configured or has nothing yet; the page hides the card. */
    @GetMapping("/api/now/rating")
    public ResponseEntity<Map<String, List<NowRatingService.Rating>>> rating() {
        return ratings.latest()
                .filter(list -> !list.isEmpty())
                .map(list -> ResponseEntity.ok()
                        .cacheControl(CacheControl.maxAge(Duration.ofMinutes(2)).cachePublic().staleWhileRevalidate(Duration.ofMinutes(10)))
                        .body(Map.of("ratings", list)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
