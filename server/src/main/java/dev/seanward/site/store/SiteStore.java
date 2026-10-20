package dev.seanward.site.store;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Everything the site saves: the editable content, private feedback, album ratings and the shared Game planet. */
public interface SiteStore {

    /** The site's words, as edited in the admin panel. Empty until the first edit; the starting content is used then. */
    Optional<Map<String, Object>> content();

    void saveContent(Map<String, Object> content);

    void saveFeedback(Feedback feedback);

    List<Feedback> feedback();

    boolean deleteFeedback(String id);

    /** Records one visitor's score for an album and returns the album's totals. */
    AlbumStats rate(String albumId, double score);

    AlbumStats albumStats(String albumId);

    List<Mark> marks();

    void addMark(Mark mark);

    boolean deleteMark(String id);

    record Feedback(String id, String message, String name, Instant at) {}

    record AlbumStats(String albumId, long count, double average) {}

    /** A lantern a visitor left on the Game planet: where it stands (latitude, longitude in degrees) and its note. */
    record Mark(String id, double lat, double lon, String note, String color, Instant at) {}
}
