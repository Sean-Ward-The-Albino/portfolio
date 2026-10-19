package dev.seanward.site.web;

import java.io.IOException;
import java.time.Duration;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the static site Astro built into classpath:/static.
 *
 * <ul>
 *   <li>{@code /_astro/**}: content-hashed files, cached for a year and never revalidated.</li>
 *   <li>Pages: {@code /writing/foo} serves {@code writing/foo.html}. Browsers revalidate every time; Cloudflare may
 *       keep a copy for ten minutes and serve it stale for a day while it refreshes, so a cold Cloud Run instance
 *       is almost never on a visitor's path.</li>
 * </ul>
 */
@Configuration
public class StaticSiteConfig implements WebMvcConfigurer {

    static final String ROOT = "classpath:/static/";
    static final CacheControl PAGE_CACHE = CacheControl.maxAge(Duration.ZERO).cachePublic().mustRevalidate()
            .sMaxAge(Duration.ofMinutes(10)).staleWhileRevalidate(Duration.ofDays(1));

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/_astro/**")
                .addResourceLocations(ROOT + "_astro/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());

        registry.addResourceHandler("/pagefind/**", "/brand/**", "/og/**")
                .addResourceLocations(ROOT + "pagefind/", ROOT + "brand/", ROOT + "og/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic().staleWhileRevalidate(Duration.ofDays(7)));

        registry.addResourceHandler("/**")
                .addResourceLocations(ROOT)
                .setCacheControl(PAGE_CACHE)
                .resourceChain(true)
                .addResolver(new PageResolver());
    }

    /** Resolves extensionless page URLs to the .html files Astro writes, and folders to their index.html. */
    static final class PageResolver extends PathResourceResolver {
        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            if (resourcePath.isEmpty() || resourcePath.endsWith("/")) {
                return super.getResource(resourcePath + "index.html", location);
            }
            Resource exact = super.getResource(resourcePath, location);
            if (exact != null) {
                return exact;
            }
            String last = resourcePath.substring(resourcePath.lastIndexOf('/') + 1);
            return last.contains(".") ? null : super.getResource(resourcePath + ".html", location);
        }
    }
}
