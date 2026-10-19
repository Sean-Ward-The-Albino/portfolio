package dev.seanward.site.api;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The synced Avlory facts (versions, roadmap, engineering stats) as JSON, for anyone who wants them. */
@RestController
public class AvloryController {

    private final byte[] facts;

    public AvloryController() throws IOException {
        ClassPathResource r = new ClassPathResource("content/generated.json");
        try (InputStream in = r.exists() ? r.getInputStream() : InputStream.nullInputStream()) {
            byte[] bytes = in.readAllBytes();
            facts = bytes.length == 0 ? "{}".getBytes() : bytes;
        }
    }

    @GetMapping("/api/avlory")
    public ResponseEntity<byte[]> facts() {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic())
                .header("Access-Control-Allow-Origin", "*")
                .body(facts);
    }
}
