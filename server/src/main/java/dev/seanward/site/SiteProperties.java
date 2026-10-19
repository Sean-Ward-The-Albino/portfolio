package dev.seanward.site;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Settings from application.yml; secrets come from environment variables on Cloud Run. */
@ConfigurationProperties("site")
public record SiteProperties(String store, Firestore firestore, Waverate waverate, Turnstile turnstile) {

    public record Firestore(String project) {}

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
