package dev.seanward.site.web;

import java.net.URI;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Keeps links to the first version of the site working: each old page points to where its content lives now. */
@RestController
public class LegacyRedirects {

    private static final Map<String, String> PAGES = Map.of(
            "index.html", "/",
            "home.html", "/",
            "about.html", "/about",
            "projects.html", "/avlory",
            "avlory-future.html", "/avlory",
            "tech-takes.html", "/writing?kind=take",
            "aspirations.html", "/about",
            "shoutouts.html", "/about",
            "contact.html", "/about");

    @GetMapping("/HTML/{page}")
    public ResponseEntity<Void> redirect(@PathVariable String page) {
        String target = PAGES.getOrDefault(page, "/");
        return ResponseEntity.status(HttpStatus.MOVED_PERMANENTLY).location(URI.create(target)).build();
    }
}
