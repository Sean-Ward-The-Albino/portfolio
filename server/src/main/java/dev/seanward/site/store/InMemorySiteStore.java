package dev.seanward.site.store;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

/** For local runs and tests. Everything is lost on restart. */
public class InMemorySiteStore implements SiteStore {

    private final Map<String, Map<String, AtomicLong>> reactions = new ConcurrentHashMap<>();
    private final List<Feedback> feedback = new CopyOnWriteArrayList<>();

    @Override
    public Map<String, Long> reactions(String slug) {
        return snapshot(reactions.getOrDefault(slug, Map.of()));
    }

    @Override
    public Map<String, Long> addReaction(String slug, String kind) {
        Map<String, AtomicLong> counts = reactions.computeIfAbsent(slug, s -> new ConcurrentHashMap<>());
        counts.computeIfAbsent(kind, k -> new AtomicLong()).incrementAndGet();
        return snapshot(counts);
    }

    @Override
    public void saveFeedback(Feedback item) {
        feedback.add(item);
    }

    public List<Feedback> feedback() {
        return List.copyOf(feedback);
    }

    private static Map<String, Long> snapshot(Map<String, AtomicLong> counts) {
        return counts.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().get()));
    }
}
