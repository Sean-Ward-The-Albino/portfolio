package dev.seanward.site.api;

import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** Which posts exist, read from the built site, so the API only ever stores data for real posts. */
@Component
public class PostCatalog {

    private static final Pattern SLUG = Pattern.compile("^[a-z0-9][a-z0-9-]{0,99}$");

    public boolean exists(String slug) {
        return slug != null && SLUG.matcher(slug).matches() && new ClassPathResource("static/writing/" + slug + ".html").exists();
    }
}
