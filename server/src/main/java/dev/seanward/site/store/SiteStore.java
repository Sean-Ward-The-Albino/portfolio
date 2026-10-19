package dev.seanward.site.store;

import java.time.Instant;
import java.util.Map;

/** Where reactions and feedback are kept: in memory for local runs, Firestore in production. */
public interface SiteStore {

    /** Reaction counts for a post, by kind. Kinds with no reactions may be missing. */
    Map<String, Long> reactions(String slug);

    /** Adds one reaction and returns the new counts. */
    Map<String, Long> addReaction(String slug, String kind);

    void saveFeedback(Feedback feedback);

    record Feedback(String slug, String message, String name, Instant at) {}
}
