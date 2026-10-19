package dev.seanward.site.web;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Serves the home page at "/" directly, instead of Spring's welcome-page forward. */
@RestController
public class HomeController {

    private final Resource home = new ClassPathResource("static/index.html");

    @GetMapping("/")
    public ResponseEntity<Resource> home() {
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).cacheControl(StaticSiteConfig.PAGE_CACHE).body(home);
    }
}
