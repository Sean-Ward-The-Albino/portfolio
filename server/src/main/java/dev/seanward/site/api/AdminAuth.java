package dev.seanward.site.api;

import dev.seanward.site.SiteProperties;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * Checks the admin token on every admin call. The token comes from {@code ADMIN_TOKEN}; without it a random one is
 * made at startup and printed to the log, which is fine for running locally. Avlory ID sign-in can replace this later.
 */
@Component
public class AdminAuth {

    private static final Logger log = LoggerFactory.getLogger(AdminAuth.class);

    private final RateLimiter limiter;
    private final ClientKeys keys;
    private final byte[] token;

    public AdminAuth(SiteProperties props, RateLimiter limiter, ClientKeys keys) {
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

    /** Null when the call may go ahead; otherwise the response to send. */
    public ResponseEntity<Map<String, String>> deny(String auth, HttpServletRequest request) {
        if (!limiter.allow("admin:" + keys.keyFor(request), 60, Duration.ofMinutes(1))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "too_many"));
        }
        String given = auth != null && auth.startsWith("Bearer ") ? auth.substring(7) : "";
        // Constant-time comparison, so the token can't be guessed from response times
        if (!MessageDigest.isEqual(token, given.getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "unauthorized"));
        }
        return null;
    }
}
