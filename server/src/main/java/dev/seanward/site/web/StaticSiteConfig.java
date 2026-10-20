package dev.seanward.site.web;

import java.time.Duration;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves the site Vite built into classpath:/static.
 *
 * <ul>
 *   <li>{@code /assets/**}: content-hashed files, cached for a year and never revalidated.</li>
 *   <li>Everything else (pages, images): browsers revalidate each time; Cloudflare may keep a copy for ten minutes
 *       and serve it stale for a day while it refreshes.</li>
 * </ul>
 */
@Configuration
public class StaticSiteConfig implements WebMvcConfigurer {

    static final String ROOT = "classpath:/static/";
    static final CacheControl PAGE_CACHE = CacheControl.maxAge(Duration.ZERO).cachePublic().mustRevalidate()
            .sMaxAge(Duration.ofMinutes(10)).staleWhileRevalidate(Duration.ofDays(1));

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/assets/**")
                .addResourceLocations(ROOT + "assets/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
        registry.addResourceHandler("/**")
                .addResourceLocations(ROOT)
                .setCacheControl(PAGE_CACHE);
    }
}
