package dev.seanward.site.live;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/** The Game planet's live channel. Only pages from this site may connect (Spring's default same-origin check). */
@Configuration
@EnableWebSocket
public class LiveConfig implements WebSocketConfigurer {

    private final PresenceHandler presence;

    public LiveConfig(PresenceHandler presence) {
        this.presence = presence;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(presence, "/api/game/presence");
    }
}
