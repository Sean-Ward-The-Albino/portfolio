package dev.seanward.site.store;

import dev.seanward.site.SiteProperties;
import java.nio.file.Path;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;

@Configuration
public class StoreConfig {

    @Bean
    SiteStore siteStore(SiteProperties props, JsonMapper json) {
        String dir = props.dataDir() == null || props.dataDir().isBlank() ? "data" : props.dataDir();
        return new FileSiteStore(Path.of(dir), json);
    }
}
