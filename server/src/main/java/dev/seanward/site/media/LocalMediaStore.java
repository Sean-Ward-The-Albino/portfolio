package dev.seanward.site.media;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

/** Keeps uploads in a folder and serves them from /media/. Fine for running locally; files vanish with a Cloud Run instance. */
public class LocalMediaStore implements MediaStore {

    private final Path dir;

    public LocalMediaStore(Path dir) {
        this.dir = dir;
    }

    @Override
    public String put(String key, byte[] bytes, String contentType) {
        try {
            Files.createDirectories(dir);
            Files.write(dir.resolve(key), bytes);
            return "/media/" + key;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(dir.resolve(key));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public Optional<Resource> local(String key) {
        Path p = dir.resolve(key).normalize();
        return p.startsWith(dir) && Files.isRegularFile(p) ? Optional.of(new FileSystemResource(p)) : Optional.empty();
    }
}
