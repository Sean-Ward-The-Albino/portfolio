package dev.seanward.site.media;

import dev.seanward.site.SiteProperties;
import java.nio.file.Path;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class MediaConfig {

    @Bean
    MediaStore mediaStore(SiteProperties props, RestClient.Builder builder) {
        SiteProperties.Media m = props.media();
        if (m != null && m.bucket() != null && !m.bucket().isBlank()) return new GcsMediaStore(m.bucket(), m.publicBase(), builder);
        String dir = props.dataDir() == null || props.dataDir().isBlank() ? "data" : props.dataDir();
        return new LocalMediaStore(Path.of(dir, "media").toAbsolutePath().normalize());
    }
}
