package dev.seanward.site;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestPropertySource;

/** Two visitors connect; each sees the other's firefly. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {"site.admin.token=test-token", "site.data-dir=target/test-data-${random.uuid}"})
class PresenceTest {

    @LocalServerPort int port;

    record Client(WebSocket ws, LinkedBlockingQueue<String> inbox) {}

    Client connect() throws Exception {
        LinkedBlockingQueue<String> inbox = new LinkedBlockingQueue<>();
        WebSocket ws = HttpClient.newHttpClient().newWebSocketBuilder()
                .header("Origin", "http://localhost:" + port)
                .buildAsync(URI.create("ws://localhost:" + port + "/api/game/presence"), new WebSocket.Listener() {
                    @Override
                    public CompletionStage<?> onText(WebSocket w, CharSequence data, boolean last) {
                        inbox.add(data.toString());
                        w.request(1);
                        return CompletableFuture.completedFuture(null);
                    }
                }).get(5, TimeUnit.SECONDS);
        return new Client(ws, inbox);
    }

    @Test
    void visitorsSeeEachOther() throws Exception {
        Client a = connect(), b = connect();
        assertThat(a.inbox().poll(3, TimeUnit.SECONDS)).contains("\"t\":\"hello\"");
        b.ws().sendText("{\"lat\":12.3,\"lon\":-45.6}", true).get();
        String seen = null;
        for (int i = 0; i < 20 && (seen == null || !seen.contains("12.3")); i++) seen = a.inbox().poll(1, TimeUnit.SECONDS);
        assertThat(seen).contains("\"lat\":12.3").contains("\"lon\":-45.6").contains("\"n\":2");
        a.ws().abort(); b.ws().abort();
    }
}
