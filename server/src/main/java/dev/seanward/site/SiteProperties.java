package dev.seanward.site;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Settings from application.yml; secrets come from environment variables, never from files in the repo. */
@ConfigurationProperties("site")
public record SiteProperties(String dataDir, String contentFile, Admin admin, Waverate waverate, Turnstile turnstile) {

    /** The admin panel's token. When blank, a random one is made at startup and printed to the log. */
    public record Admin(String token) {}

    public record Waverate(String baseUrl, String apiKey, String userId) {
        public boolean configured() {
            return apiKey != null && !apiKey.isBlank() && userId != null && !userId.isBlank();
        }
    }

    public record Turnstile(String secret) {
        public boolean enabled() {
            return secret != null && !secret.isBlank();
        }
    }
}
