package dev.seanward.site.store;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;

/**
 * Keeps everything in memory and writes it to one JSON file after each change, so a local run survives restarts.
 * Writes go to a temporary file first and are then moved into place, so a crash never leaves half a file.
 *
 * <p>On Cloud Run the file lives only as long as the instance; point {@code SITE_DATA_DIR} at a mounted volume, or
 * swap in a Firestore-backed {@link SiteStore}, before relying on it in production.
 */
public class FileSiteStore implements SiteStore {

    private static final Logger log = LoggerFactory.getLogger(FileSiteStore.class);
    static final int MAX_MARKS = 2000;
    static final int MAX_FEEDBACK = 5000;

    /** What's on disk. */
    record Data(Map<String, Object> content, List<Feedback> feedback, Map<String, double[]> albums, List<Mark> marks) {
        static Data empty() {
            return new Data(null, new ArrayList<>(), new LinkedHashMap<>(), new ArrayList<>());
        }
    }

    private final Path file;
    private final JsonMapper json;
    private Data data;

    public FileSiteStore(Path dir, JsonMapper json) {
        this.json = json;
        this.file = dir.resolve("site-data.json");
        this.data = load();
    }

    private Data load() {
        if (!Files.exists(file)) return Data.empty();
        try {
            Data d = json.readValue(file.toFile(), Data.class);
            return new Data(d.content(),
                    d.feedback() == null ? new ArrayList<>() : new ArrayList<>(d.feedback()),
                    d.albums() == null ? new LinkedHashMap<>() : new LinkedHashMap<>(d.albums()),
                    d.marks() == null ? new ArrayList<>() : new ArrayList<>(d.marks()));
        } catch (RuntimeException e) {
            log.warn("Couldn't read {}; starting empty and keeping the old file as .bad", file);
            try {
                Files.move(file, file.resolveSibling("site-data.json.bad"), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ignored) {
                // Nothing more to do; the next save writes a fresh file.
            }
            return Data.empty();
        }
    }

    private void save() {
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling("site-data.json.tmp");
            json.writeValue(tmp.toFile(), data);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public synchronized Optional<Map<String, Object>> content() {
        return Optional.ofNullable(data.content());
    }

    @Override
    public synchronized void saveContent(Map<String, Object> content) {
        data = new Data(content, data.feedback(), data.albums(), data.marks());
        save();
    }

    @Override
    public synchronized void saveFeedback(Feedback feedback) {
        data.feedback().add(feedback);
        while (data.feedback().size() > MAX_FEEDBACK) data.feedback().removeFirst();
        save();
    }

    @Override
    public synchronized List<Feedback> feedback() {
        return List.copyOf(data.feedback());
    }

    @Override
    public synchronized boolean deleteFeedback(String id) {
        boolean removed = data.feedback().removeIf(f -> f.id().equals(id));
        if (removed) save();
        return removed;
    }

    @Override
    public synchronized AlbumStats rate(String albumId, double score) {
        double[] totals = data.albums().computeIfAbsent(albumId, k -> new double[2]);
        totals[0] += 1;
        totals[1] += score;
        save();
        return stats(albumId, totals);
    }

    @Override
    public synchronized AlbumStats albumStats(String albumId) {
        return stats(albumId, data.albums().getOrDefault(albumId, new double[2]));
    }

    private static AlbumStats stats(String albumId, double[] totals) {
        long count = (long) totals[0];
        return new AlbumStats(albumId, count, count == 0 ? 0 : Math.round(totals[1] / count * 100) / 100.0);
    }

    @Override
    public synchronized List<Mark> marks() {
        return List.copyOf(data.marks());
    }

    @Override
    public synchronized void addMark(Mark mark) {
        data.marks().add(mark);
        while (data.marks().size() > MAX_MARKS) data.marks().removeFirst();
        save();
    }

    @Override
    public synchronized boolean deleteMark(String id) {
        boolean removed = data.marks().removeIf(m -> m.id().equals(id));
        if (removed) save();
        return removed;
    }
}
