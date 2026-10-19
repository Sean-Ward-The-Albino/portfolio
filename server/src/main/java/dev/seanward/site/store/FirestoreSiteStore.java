package dev.seanward.site.store;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

/**
 * Firestore through its REST API, authenticated as the Cloud Run service account through the metadata server.
 * No SDK: it keeps the native image small and starts instantly.
 *
 * <p>Collections: {@code reactions/{slug}} holds one counter field per kind; {@code feedback/{id}} holds each message.
 * Read feedback in the Firebase console. The service account needs the "Cloud Datastore User" role.
 */
public class FirestoreSiteStore implements SiteStore {

    private static final Logger log = LoggerFactory.getLogger(FirestoreSiteStore.class);
    private static final String METADATA_TOKEN = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

    private final RestClient http;
    private final String documents;
    private volatile String token;
    private volatile Instant tokenExpires = Instant.EPOCH;

    public FirestoreSiteStore(RestClient.Builder builder, String project) {
        this.http = builder.build();
        this.documents = "https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents";
    }

    @Override
    public Map<String, Long> reactions(String slug) {
        try {
            Map<?, ?> doc = http.get().uri(documents + "/reactions/{slug}", slug)
                    .header("Authorization", "Bearer " + token())
                    .retrieve().body(Map.class);
            return counts(doc);
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.NOT_FOUND) return Map.of();
            throw e;
        }
    }

    @Override
    public Map<String, Long> addReaction(String slug, String kind) {
        String name = documents.substring(documents.indexOf("projects/")) + "/reactions/" + slug;
        Map<String, Object> write = Map.of("transform", Map.of(
                "document", name,
                "fieldTransforms", List.of(Map.of("fieldPath", kind, "increment", Map.of("integerValue", "1")))));
        http.post().uri(documents.replace("/documents", "/documents:commit"))
                .header("Authorization", "Bearer " + token())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("writes", List.of(write)))
                .retrieve().toBodilessEntity();
        return reactions(slug);
    }

    @Override
    public void saveFeedback(Feedback f) {
        Map<String, Object> fields = new HashMap<>();
        fields.put("slug", Map.of("stringValue", f.slug()));
        fields.put("message", Map.of("stringValue", f.message()));
        fields.put("name", Map.of("stringValue", f.name()));
        fields.put("at", Map.of("timestampValue", f.at().toString()));
        http.post().uri(documents + "/feedback?documentId={id}", UUID.randomUUID().toString())
                .header("Authorization", "Bearer " + token())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("fields", fields))
                .retrieve().toBodilessEntity();
    }

    private static Map<String, Long> counts(Map<?, ?> doc) {
        Map<String, Long> out = new HashMap<>();
        if (doc != null && doc.get("fields") instanceof Map<?, ?> fields) {
            fields.forEach((k, v) -> {
                if (v instanceof Map<?, ?> value && value.get("integerValue") != null) {
                    out.put(String.valueOf(k), Long.parseLong(String.valueOf(value.get("integerValue"))));
                }
            });
        }
        return out;
    }

    private String token() {
        if (token == null || Instant.now().isAfter(tokenExpires)) {
            synchronized (this) {
                if (token == null || Instant.now().isAfter(tokenExpires)) {
                    Map<?, ?> t = http.get().uri(METADATA_TOKEN).header("Metadata-Flavor", "Google").retrieve().body(Map.class);
                    if (t == null || t.get("access_token") == null) throw new IllegalStateException("No token from the metadata server");
                    token = String.valueOf(t.get("access_token"));
                    long seconds = Long.parseLong(String.valueOf(t.get("expires_in")));
                    tokenExpires = Instant.now().plus(Duration.ofSeconds(Math.max(60, seconds - 120)));
                    log.debug("Refreshed Firestore token");
                }
            }
        }
        return token;
    }
}
