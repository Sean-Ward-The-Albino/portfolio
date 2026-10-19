package dev.seanward.site.web;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Unknown pages get the site's own 404 page; unknown API paths get a short JSON answer. */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class NotFoundAdvice {

    private final ClassPathResource page = new ClassPathResource("static/404.html");

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<?> notFound(HttpServletRequest request) throws IOException {
        if (request.getRequestURI().startsWith("/api/") || !page.exists()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON).body(Map.of("error", "not_found"));
        }
        try (InputStream in = page.getInputStream()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.TEXT_HTML)
                    .cacheControl(CacheControl.noCache())
                    .body(in.readAllBytes());
        }
    }
}
