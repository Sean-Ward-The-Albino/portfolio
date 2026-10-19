package dev.seanward.site.api;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

/**
 * Turns a visitor's IP address into an anonymous key for rate limiting. The address is hashed with a random salt
 * that changes every day and is never written anywhere, so keys can't be traced back to people or across days.
 */
@Component
public class ClientKeys {

    private final SecureRandom random = new SecureRandom();
    private volatile LocalDate saltDay;
    private volatile byte[] salt;

    public String keyFor(HttpServletRequest request) {
        return hash(clientIp(request));
    }

    /**
     * Cloudflare's header when it's in front, otherwise the last forwarded address (the one Cloud Run's front end
     * added itself; earlier entries come from the client and can be made up), otherwise the socket. Restrict the
     * Cloud Run service's ingress to Cloudflare so the Cloudflare header can't be sent directly.
     */
    static String clientIp(HttpServletRequest request) {
        String cf = request.getHeader("CF-Connecting-IP");
        if (cf != null && !cf.isBlank()) return cf.trim();
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            String[] hops = xff.split(",");
            return hops[hops.length - 1].trim();
        }
        return request.getRemoteAddr();
    }

    private String hash(String ip) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        if (!today.equals(saltDay)) {
            synchronized (this) {
                if (!today.equals(saltDay)) {
                    byte[] fresh = new byte[32];
                    random.nextBytes(fresh);
                    salt = fresh;
                    saltDay = today;
                }
            }
        }
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            sha.update(salt);
            return HexFormat.of().formatHex(sha.digest(ip.getBytes(StandardCharsets.UTF_8)), 0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
