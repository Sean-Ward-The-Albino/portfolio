package dev.seanward.site.media;

import dev.seanward.site.api.AdminAuth;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Uploads from the admin panel. Photos arrive already resized in the browser (so iPhone HEIC photos work) as a large
 * and a small WebP or JPEG; tracks arrive as MP3 or M4A. Every file is checked by its first bytes, not its name, and
 * gets a random, unguessable name.
 */
@RestController
public class MediaController {

    static final long MAX_IMAGE = 4L * 1024 * 1024, MAX_AUDIO = 40L * 1024 * 1024;
    private static final Pattern KEY = Pattern.compile("^[a-f0-9]{24}(-s)?\\.(webp|jpg|png|mp3|m4a)$");

    private final MediaStore store;
    private final AdminAuth auth;
    private final SecureRandom random = new SecureRandom();

    public MediaController(MediaStore store, AdminAuth auth) {
        this.store = store;
        this.auth = auth;
    }

    @PostMapping("/api/admin/media/photo")
    public ResponseEntity<?> photo(@RequestHeader(value = "Authorization", required = false) String token, @RequestParam MultipartFile large,
                                   @RequestParam(required = false) MultipartFile small, HttpServletRequest req) throws IOException {
        var no = auth.deny(token, req);
        if (no != null) return no;
        String id = newId();
        Map<String, Object> out = new LinkedHashMap<>();
        String ext = imageType(large);
        if (ext == null) return ResponseEntity.unprocessableContent().body(Map.of("error", "not_an_image"));
        out.put("src", store.put(id + "." + ext, large.getBytes(), contentType(ext)));
        if (small != null && !small.isEmpty()) {
            String se = imageType(small);
            if (se == null) return ResponseEntity.unprocessableContent().body(Map.of("error", "not_an_image"));
            out.put("small", store.put(id + "-s." + se, small.getBytes(), contentType(se)));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    @PostMapping("/api/admin/media/track")
    public ResponseEntity<?> track(@RequestHeader(value = "Authorization", required = false) String token, @RequestParam MultipartFile file, HttpServletRequest req) throws IOException {
        var no = auth.deny(token, req);
        if (no != null) return no;
        if (file.getSize() > MAX_AUDIO) return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("error", "too_big"));
        byte[] b = file.getBytes();
        String ext = isMp3(b) ? "mp3" : isM4a(b) ? "m4a" : null;
        if (ext == null) return ResponseEntity.unprocessableContent().body(Map.of("error", "not_audio"));
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("src", store.put(newId() + "." + ext, b, contentType(ext))));
    }

    @DeleteMapping("/api/admin/media/{key}")
    public ResponseEntity<?> delete(@RequestHeader(value = "Authorization", required = false) String token, @PathVariable String key, HttpServletRequest req) {
        var no = auth.deny(token, req);
        if (no != null) return no;
        if (!KEY.matcher(key).matches()) return ResponseEntity.badRequest().build();
        store.delete(key);
        return ResponseEntity.noContent().build();
    }

    /** Local runs only: serves stored files, with byte ranges so audio can seek. */
    @GetMapping("/media/{key}")
    public ResponseEntity<Resource> serve(@PathVariable String key) {
        if (!KEY.matcher(key).matches()) return ResponseEntity.notFound().build();
        return store.local(key)
                .map(r -> ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                        .contentType(MediaType.parseMediaType(contentType(key.substring(key.lastIndexOf('.') + 1)))).body(r))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    private String newId() {
        byte[] b = new byte[12];
        random.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }

    private static String imageType(MultipartFile f) throws IOException {
        if (f == null || f.isEmpty() || f.getSize() > MAX_IMAGE) return null;
        byte[] b = f.getInputStream().readNBytes(12);
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "webp";
        if (b.length >= 3 && (b[0] & 0xff) == 0xFF && (b[1] & 0xff) == 0xD8 && (b[2] & 0xff) == 0xFF) return "jpg";
        if (b.length >= 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "png";
        return null;
    }

    private static boolean isMp3(byte[] b) {
        return b.length > 3 && ((b[0] == 'I' && b[1] == 'D' && b[2] == '3') || ((b[0] & 0xff) == 0xFF && (b[1] & 0xE0) == 0xE0));
    }

    private static boolean isM4a(byte[] b) {
        return b.length > 12 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p';
    }

    static String contentType(String ext) {
        return switch (ext) {
            case "webp" -> "image/webp";
            case "jpg" -> "image/jpeg";
            case "png" -> "image/png";
            case "mp3" -> "audio/mpeg";
            case "m4a" -> "audio/mp4";
            default -> "application/octet-stream";
        };
    }
}
