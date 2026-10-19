package dev.seanward.site.store;

import dev.seanward.site.SiteProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class StoreConfig {

    @Bean
    SiteStore siteStore(SiteProperties props, RestClient.Builder builder) {
        if ("firestore".equalsIgnoreCase(props.store())) {
            String project = props.firestore() == null ? null : props.firestore().project();
            if (project == null || project.isBlank()) {
                throw new IllegalStateException("SITE_STORE=firestore needs GOOGLE_CLOUD_PROJECT");
            }
            return new FirestoreSiteStore(builder, project);
        }
        return new InMemorySiteStore();
    }
}
