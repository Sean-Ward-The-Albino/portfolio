package dev.seanward.site.live;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Who else is on the Game planet right now. Each visitor sends where they're hovering over the planet a few times a
 * second; five times a second everyone gets everyone else's spot, drawn as fireflies. Nothing is stored and nobody is
 * named: each connection gets a random id and a colour, and is forgotten when it closes.
 */
@Component
public class PresenceHandler extends TextWebSocketHandler {

    static final int MAX_VISITORS = 300;
    static final String[] COLORS = {"#ffd36b", "#7fd8b4", "#8fb6ff", "#ff8a6a", "#ff74ea", "#c9b6ff", "#ffffff"};

    record Spot(String id, String c, double lat, double lon) {}

    private static final class Visitor {
        final WebSocketSession session;
        final String id;
        final String color;
        volatile double lat, lon;
        volatile boolean placed;
        long windowStart;
        int messages;

        Visitor(WebSocketSession session, String id, String color) {
            this.session = session;
            this.id = id;
            this.color = color;
        }
    }

    private final Map<String, Visitor> visitors = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final JsonMapper json;
    private volatile boolean changed;

    public PresenceHandler(JsonMapper json) {
        this.json = json;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        if (visitors.size() >= MAX_VISITORS) {
            session.close(CloseStatus.SERVICE_OVERLOAD);
            return;
        }
        session.setTextMessageSizeLimit(256);
        byte[] b = new byte[4];
        random.nextBytes(b);
        String id = HexFormat.of().formatHex(b);
        Visitor v = new Visitor(new ConcurrentWebSocketSessionDecorator(session, 2000, 8 * 1024), id, COLORS[random.nextInt(COLORS.length)]);
        visitors.put(session.getId(), v);
        v.session.sendMessage(new TextMessage(json.writeValueAsString(Map.of("t", "hello", "you", id, "c", v.color))));
        changed = true;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        Visitor v = visitors.get(session.getId());
        if (v == null) return;
        // At most ten updates a second per visitor; extras are dropped
        long now = System.currentTimeMillis();
        if (now - v.windowStart > 1000) { v.windowStart = now; v.messages = 0; }
        if (++v.messages > 10) return;
        try {
            JsonNode n = json.readTree(message.getPayload());
            double lat = n.path("lat").asDouble(Double.NaN), lon = n.path("lon").asDouble(Double.NaN);
            if (Double.isNaN(lat) || Double.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
            v.lat = Math.round(lat * 10) / 10.0;
            v.lon = Math.round(lon * 10) / 10.0;
            v.placed = true;
            changed = true;
        } catch (RuntimeException e) {
            // Not JSON: ignore it
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        if (visitors.remove(session.getId()) != null) changed = true;
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        visitors.remove(session.getId());
        changed = true;
    }

    public int count() {
        return visitors.size();
    }

    /** Five times a second, when anything moved, send everyone the current spots. */
    @Scheduled(fixedRate = 200)
    void broadcast() {
        if (!changed || visitors.isEmpty()) return;
        changed = false;
        List<Spot> spots = new ArrayList<>();
        for (Visitor v : visitors.values()) if (v.placed) spots.add(new Spot(v.id, v.color, v.lat, v.lon));
        TextMessage msg = new TextMessage(json.writeValueAsString(Map.of("t", "here", "n", visitors.size(), "spots", spots)));
        for (Visitor v : visitors.values()) {
            try {
                v.session.sendMessage(msg);
            } catch (IOException | IllegalStateException e) {
                visitors.remove(v.session.getId());
            }
        }
    }
}
