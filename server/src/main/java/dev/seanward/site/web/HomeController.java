package dev.seanward.site.web;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The site is one page; the admin panel is a second. Both are served directly instead of by a welcome-page forward. */
@RestController
public class HomeController {

    private final Resource home = new ClassPathResource("static/index.html");
    private final Resource admin = new ClassPathResource("static/admin.html");

    @GetMapping("/")
    public ResponseEntity<Resource> home() {
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).cacheControl(StaticSiteConfig.PAGE_CACHE).body(home);
    }

    @GetMapping({"/admin", "/admin/"})
    public ResponseEntity<Resource> admin() {
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).header("X-Robots-Tag", "noindex").body(admin);
    }
}
