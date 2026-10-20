package dev.seanward.site.media;

import java.util.Optional;
import org.springframework.core.io.Resource;

/** Where uploaded photos and tracks live: Google Cloud Storage in production, a folder on disk locally. */
public interface MediaStore {

    /** Stores the bytes and returns the URL pages should use for them. */
    String put(String key, byte[] bytes, String contentType);

    void delete(String key);

    /** For the local store only: the file to serve at /media/{key}. */
    default Optional<Resource> local(String key) {
        return Optional.empty();
    }

    /** Origin to allow in the page's security policy for images and audio, or null when it's this site. */
    default String origin() {
        return null;
    }
}
