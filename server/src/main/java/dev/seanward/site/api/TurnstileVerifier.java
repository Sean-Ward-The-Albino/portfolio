package dev.seanward.site.api;

import dev.seanward.site.SiteProperties;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

/** Checks a Cloudflare Turnstile token. When no secret is configured, every request passes. */
@Component
public class TurnstileVerifier {

    private static final Logger log = LoggerFactory.getLogger(TurnstileVerifier.class);
    private static final String VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    private final SiteProperties.Turnstile config;
    private final RestClient http;

    public TurnstileVerifier(SiteProperties props, RestClient.Builder builder) {
        this.config = props.turnstile();
        this.http = builder.build();
    }

    public boolean verify(String token, String remoteIp) {
        if (config == null || !config.enabled()) return true;
        if (token == null || token.isBlank() || token.length() > 2048) return false;
        LinkedMultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("secret", config.secret());
        form.add("response", token);
        form.add("remoteip", remoteIp);
        try {
            Map<?, ?> result = http.post().uri(VERIFY).contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(Map.class);
            return result != null && Boolean.TRUE.equals(result.get("success"));
        } catch (RuntimeException e) {
            log.warn("Turnstile check failed: {}", e.getClass().getSimpleName());
            return false;
        }
    }
}
