package dev.seanward.site.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Security headers on every response. Pages may only run this site's own scripts; the only outside things allowed are
 * Google Fonts and album art from Apple's image servers. API responses get a policy that allows nothing at all.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SecurityHeadersFilter extends OncePerRequestFilter {

    static String pageCsp(String media) {
        String m = media == null ? "" : " " + media;
        return String.join("; ",
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https://*.mzstatic.com" + m,
            "media-src 'self' blob:" + m,
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "object-src 'none'",
            "form-action 'self'");
    }

    private final String pageCsp;

    public SecurityHeadersFilter(dev.seanward.site.media.MediaStore media) {
        this.pageCsp = pageCsp(media.origin());
    }

    static final String API_CSP = "default-src 'none'; frame-ancestors 'none'";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        boolean api = request.getRequestURI().startsWith("/api/");
        response.setHeader("Content-Security-Policy", api ? API_CSP : pageCsp);
        if (request.isSecure()) response.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        chain.doFilter(request, response);
    }
}
