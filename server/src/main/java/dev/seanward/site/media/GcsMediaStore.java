package dev.seanward.site.media;

import java.time.Instant;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

/**
 * Stores uploads in a Google Cloud Storage bucket through its JSON API, using the Cloud Run service account's token
 * from the metadata server. No SDK, so the native image stays small. The bucket should allow public reads; pages load
 * files straight from it (and Cloudflare can cache them), so visitors never cost the server any bandwidth.
 */
public class GcsMediaStore implements MediaStore {

    private static final String METADATA = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

    private final String bucket;
    private final String publicBase;
    private final RestClient http;
    private volatile String token;
    private volatile Instant tokenExpires = Instant.EPOCH;

    public GcsMediaStore(String bucket, String publicBase, RestClient.Builder builder) {
        this.bucket = bucket;
        this.publicBase = publicBase == null || publicBase.isBlank() ? "https://storage.googleapis.com/" + bucket : publicBase.replaceAll("/$", "");
        this.http = builder.build();
    }

    private String token() {
        if (Instant.now().isBefore(tokenExpires)) return token;
        synchronized (this) {
            if (Instant.now().isBefore(tokenExpires)) return token;
            Map<?, ?> t = http.get().uri(METADATA).header("Metadata-Flavor", "Google").retrieve().body(Map.class);
            if (t == null || !(t.get("access_token") instanceof String s)) throw new IllegalStateException("No storage token");
            token = s;
            long secs = t.get("expires_in") instanceof Number n ? n.longValue() : 300;
            tokenExpires = Instant.now().plusSeconds(Math.max(30, secs - 60));
            return token;
        }
    }

    @Override
    public String put(String key, byte[] bytes, String contentType) {
        http.post()
                .uri("https://storage.googleapis.com/upload/storage/v1/b/{b}/o?uploadType=media&name={k}", bucket, key)
                .header("Authorization", "Bearer " + token())
                .contentType(MediaType.parseMediaType(contentType))
                .body(bytes)
                .retrieve().toBodilessEntity();
        return publicBase + "/" + key;
    }

    @Override
    public void delete(String key) {
        http.delete().uri("https://storage.googleapis.com/storage/v1/b/{b}/o/{k}", bucket, key)
                .header("Authorization", "Bearer " + token())
                .retrieve().toBodilessEntity();
    }

    @Override
    public String origin() {
        java.net.URI u = java.net.URI.create(publicBase);
        return u.getScheme() + "://" + u.getHost();
    }
}
