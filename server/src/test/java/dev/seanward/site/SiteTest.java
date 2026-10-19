package dev.seanward.site;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.seanward.site.store.InMemorySiteStore;
import dev.seanward.site.store.SiteStore;
import java.io.File;
import java.util.Arrays;
import java.util.Objects;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Runs against the real built site: build ../web first (npm run build), as the Dockerfile does. */
@SpringBootTest
@AutoConfigureMockMvc
class SiteTest {

    static String post;

    @Autowired MockMvc mvc;
    @Autowired SiteStore store;

    @BeforeAll
    static void findAPost() {
        File[] posts = new File("../web/dist/writing").listFiles((d, n) -> n.endsWith(".html"));
        assertThat(posts).as("Build the site first: cd ../web && npm run build").isNotEmpty();
        post = Arrays.stream(Objects.requireNonNull(posts)).map(f -> f.getName().replace(".html", "")).sorted().findFirst().orElseThrow();
    }

    @Test
    void servesPagesWithSecurityHeaders() throws Exception {
        mvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(header().string("Content-Security-Policy", containsString("frame-ancestors 'none'")))
                .andExpect(header().string("Strict-Transport-Security", containsString("max-age=")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", containsString("s-maxage=600")));
        mvc.perform(get("/writing/" + post)).andExpect(status().isOk()).andExpect(content().string(containsString("<article")));
        mvc.perform(get("/avlory")).andExpect(status().isOk());
    }

    @Test
    void hashedAssetsAreImmutable() throws Exception {
        File[] assets = new File("../web/dist/_astro").listFiles();
        assertThat(assets).isNotEmpty();
        mvc.perform(get("/_astro/" + assets[0].getName()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("immutable")));
    }

    @Test
    void unknownPagesGetTheSitesNotFoundPage() throws Exception {
        mvc.perform(get("/no-such-page")).andExpect(status().isNotFound()).andExpect(content().string(containsString("This page isn")));
        mvc.perform(get("/api/no-such-thing")).andExpect(status().isNotFound()).andExpect(jsonPath("$.error").value("not_found"));
    }

    @Test
    void neverServesFilesOutsideTheSite() throws Exception {
        mvc.perform(get("/application.yml")).andExpect(status().isNotFound());
        mvc.perform(get("/static/../application.yml")).andExpect(status().is4xxClientError());
        mvc.perform(get("/%2e%2e/application.yml")).andExpect(status().is4xxClientError());
    }

    @Test
    void oldPortfolioLinksRedirect() throws Exception {
        mvc.perform(get("/HTML/projects.html")).andExpect(status().isMovedPermanently()).andExpect(header().string("Location", "/avlory"));
        mvc.perform(get("/HTML/tech-takes.html")).andExpect(header().string("Location", "/writing?kind=take"));
    }

    @Test
    void nowRatingIsEmptyWithoutAWaverateKey() throws Exception {
        mvc.perform(get("/api/now/rating")).andExpect(status().isNoContent());
    }

    @Test
    void avloryFactsAreServed() throws Exception {
        mvc.perform(get("/api/avlory")).andExpect(status().isOk()).andExpect(jsonPath("$.roadmap").isArray())
                .andExpect(header().string("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"));
    }

    @Test
    void reactionsCountOncePerVisitorAndKind() throws Exception {
        String ip = "203.0.113.7";
        mvc.perform(post("/api/reactions/" + post + "/think").header("X-Forwarded-For", ip)).andExpect(status().isOk()).andExpect(jsonPath("$.think").value(1));
        mvc.perform(post("/api/reactions/" + post + "/think").header("X-Forwarded-For", ip)).andExpect(jsonPath("$.think").value(1));
        mvc.perform(post("/api/reactions/" + post + "/think").header("X-Forwarded-For", "198.51.100.2")).andExpect(jsonPath("$.think").value(2));
        mvc.perform(get("/api/reactions/" + post)).andExpect(jsonPath("$.think").value(2));
        mvc.perform(post("/api/reactions/" + post + "/hate")).andExpect(status().isNotFound());
        mvc.perform(post("/api/reactions/not-a-post/think")).andExpect(status().isNotFound());
        mvc.perform(post("/api/reactions/..%2Fsecret/think")).andExpect(status().is4xxClientError());
    }

    @Test
    void feedbackIsValidatedStoredAndRateLimited() throws Exception {
        InMemorySiteStore memory = (InMemorySiteStore) store;
        int before = memory.feedback().size();
        String ip = "192.0.2.44";
        mvc.perform(feedback("{\"slug\":\"" + post + "\",\"message\":\"Loved this.\\u0007\",\"name\":\"Ana\"}", ip)).andExpect(status().isAccepted());
        assertThat(memory.feedback()).hasSize(before + 1);
        assertThat(memory.feedback().getLast().message()).isEqualTo("Loved this.");

        // Honeypot: looks sent, nothing kept.
        mvc.perform(feedback("{\"slug\":\"" + post + "\",\"message\":\"buy now\",\"website\":\"spam.example\"}", ip)).andExpect(status().isAccepted());
        assertThat(memory.feedback()).hasSize(before + 1);

        mvc.perform(feedback("{\"slug\":\"" + post + "\",\"message\":\"\"}", ip)).andExpect(status().isBadRequest());
        mvc.perform(feedback("{\"slug\":\"nope\",\"message\":\"hello\"}", ip)).andExpect(status().isNotFound());

        for (int i = 0; i < 4; i++) mvc.perform(feedback("{\"slug\":\"" + post + "\",\"message\":\"again " + i + "\"}", ip));
        mvc.perform(feedback("{\"slug\":\"" + post + "\",\"message\":\"one too many\"}", ip)).andExpect(status().isTooManyRequests());
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder feedback(String json, String ip) {
        return post("/api/feedback").contentType(MediaType.APPLICATION_JSON).content(json).header("X-Forwarded-For", ip);
    }
}
