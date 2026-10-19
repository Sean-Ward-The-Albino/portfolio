package dev.seanward.site.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

    static class MovableClock extends Clock {
        Instant now = Instant.parse("2026-10-19T00:00:00Z");
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @Test
    void allowsUpToTheLimitPerWindowThenResets() {
        MovableClock clock = new MovableClock();
        RateLimiter limiter = new RateLimiter(clock);
        for (int i = 0; i < 3; i++) assertThat(limiter.allow("k", 3, Duration.ofMinutes(1))).isTrue();
        assertThat(limiter.allow("k", 3, Duration.ofMinutes(1))).isFalse();
        assertThat(limiter.allow("other", 3, Duration.ofMinutes(1))).isTrue();
        clock.now = clock.now.plusSeconds(61);
        assertThat(limiter.allow("k", 3, Duration.ofMinutes(1))).isTrue();
    }
}
