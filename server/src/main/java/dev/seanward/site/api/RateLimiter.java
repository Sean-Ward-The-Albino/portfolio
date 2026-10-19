package dev.seanward.site.api;

import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Fixed-window limits per anonymous client key, kept in memory. Each Cloud Run instance counts on its own, so treat
 * these as a floor; a Cloudflare rate-limiting rule on /api/* is the ceiling.
 */
@Component
public class RateLimiter {

    private record Window(long start, int count) {}

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final Clock clock;

    public RateLimiter() {
        this(Clock.systemUTC());
    }

    RateLimiter(Clock clock) {
        this.clock = clock;
    }

    /** True when this call is within {@code max} calls per {@code window} for {@code key}. */
    public boolean allow(String key, int max, Duration window) {
        long now = clock.millis();
        long size = window.toMillis();
        Window w = windows.compute(key, (k, old) -> old == null || now - old.start() >= size ? new Window(now, 1) : new Window(old.start(), old.count() + 1));
        if (windows.size() > 50_000) prune(now, size);
        return w.count() <= max;
    }

    private void prune(long now, long size) {
        windows.entrySet().removeIf(e -> now - e.getValue().start() >= size);
    }
}
