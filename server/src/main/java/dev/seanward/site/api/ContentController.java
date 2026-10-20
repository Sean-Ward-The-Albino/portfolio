package dev.seanward.site.api;

import dev.seanward.site.SiteProperties;
import dev.seanward.site.store.SiteStore;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** The words on every world: what the admin panel saved, or the starting content shipped with the site. */
@RestController
public class ContentController {

    private final Content content;

    public ContentController(Content content) {
        this.content = content;
    }

    @GetMapping("/api/content")
    public ResponseEntity<Map<String, Object>> get() {
        // Short cache so an edit shows within a minute, even behind Cloudflare.
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ZERO).sMaxAge(Duration.ofSeconds(60)).cachePublic()).body(content.current());
    }

    /** Reads the current content for any controller that needs it. */
    @Component
    public static class Content {
        private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};
        private final SiteStore store;
        private final Map<String, Object> starting;

        public Content(SiteStore store, JsonMapper json, SiteProperties props) {
            this.store = store;
            this.starting = readStarting(json, props.contentFile());
        }

        public Map<String, Object> current() {
            return store.content().orElse(starting);
        }

        public Map<String, Object> starting() {
            return starting;
        }

        private static Map<String, Object> readStarting(JsonMapper json, String file) {
            try {
                // A file on disk wins (handy while writing); otherwise the copy packed into the jar.
                if (file != null && !file.isBlank() && Files.exists(Path.of(file))) return json.readValue(Path.of(file).toFile(), MAP);
                try (InputStream in = new ClassPathResource("content/site.json").getInputStream()) {
                    return json.readValue(in, MAP);
                }
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }
}
