package dev.seanward.site;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"site.admin.token=test-token", "site.data-dir=target/test-data-${random.uuid}"})
class ApiTest {

    @Autowired MockMvc mvc;

    @Test
    void contentHasEveryWorld() throws Exception {
        mvc.perform(get("/api/content"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.worlds.home.stops[0].sub").value(containsString("software done right")))
                .andExpect(jsonPath("$.worlds.game.stops").isArray())
                .andExpect(header().string("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"));
    }

    @Test
    void feedbackIsAcceptedAndTheHoneypotKeepsNothing() throws Exception {
        mvc.perform(post("/api/feedback").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Love the beach\",\"name\":\"Ana\"}"))
                .andExpect(status().isAccepted());
        mvc.perform(post("/api/feedback").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"spam\",\"website\":\"x\"}"))
                .andExpect(status().isAccepted());
        mvc.perform(get("/api/admin/feedback").header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.feedback.length()").value(1))
                .andExpect(jsonPath("$.feedback[0].message").value("Love the beach"));
    }

    @Test
    void adminNeedsTheToken() throws Exception {
        mvc.perform(get("/api/admin/content")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/content").header("Authorization", "Bearer wrong")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/admin/content").header("Authorization", "Bearer test-token").contentType(MediaType.APPLICATION_JSON).content("{\"nope\":1}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminEditsShowOnTheSite() throws Exception {
        mvc.perform(put("/api/admin/content").header("Authorization", "Bearer test-token").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"worlds\":{\"home\":{\"title\":\"Home\",\"stops\":[{\"id\":\"arrive\",\"sub\":\"Edited line\"}]}}}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/content")).andExpect(jsonPath("$.worlds.home.stops[0].sub").value("Edited line"));
        mvc.perform(delete("/api/admin/content").header("Authorization", "Bearer test-token")).andExpect(status().isOk());
        mvc.perform(get("/api/content")).andExpect(jsonPath("$.worlds.home.stops[0].sub").value(containsString("software done right")));
    }

    @Test
    void albumRatingsAverageAndAreLimitedPerVisitor() throws Exception {
        mvc.perform(post("/api/albums/123/rating").contentType(MediaType.APPLICATION_JSON).content("{\"score\":8.5}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(1)).andExpect(jsonPath("$.average").value(8.5));
        // Same visitor again: not counted twice.
        mvc.perform(post("/api/albums/123/rating").contentType(MediaType.APPLICATION_JSON).content("{\"score\":2}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(1));
        mvc.perform(post("/api/albums/123/rating").contentType(MediaType.APPLICATION_JSON).content("{\"score\":11}")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/albums/not-a-number")).andExpect(status().isBadRequest());
    }

    @Test
    void lanternsAreSharedAndFiltered() throws Exception {
        mvc.perform(post("/api/game/marks").contentType(MediaType.APPLICATION_JSON).content("{\"lat\":10,\"lon\":20,\"note\":\"hi from SD\",\"color\":\"#ff74ea\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.note").value("hi from SD"));
        mvc.perform(post("/api/game/marks").contentType(MediaType.APPLICATION_JSON).content("{\"lat\":10,\"lon\":20,\"note\":\"visit www.spam.com\",\"color\":\"#ff74ea\"}"))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(post("/api/game/marks").contentType(MediaType.APPLICATION_JSON).content("{\"lat\":100,\"lon\":20,\"note\":\"x\",\"color\":\"#ff74ea\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/game/marks")).andExpect(status().isOk()).andExpect(jsonPath("$.marks.length()").value(greaterThanOrEqualTo(1)));
    }

    @Test
    void pagesGetAStrictPolicy() throws Exception {
        mvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Security-Policy", containsString("script-src 'self'")))
                .andExpect(header().string("X-Frame-Options", "DENY"));
    }
    @Test
    void chessFollowsTheRulesOnTheServer() throws Exception {
        mvc.perform(post("/api/chess/play").contentType(MediaType.APPLICATION_JSON).content("{\"moves\":[\"e2e4\",\"e7e5\",\"d1h5\",\"b8c6\",\"f1c4\",\"g8f6\",\"h5f7\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("checkmate")).andExpect(jsonPath("$.san[6]").value("Qxf7#"));
        mvc.perform(post("/api/chess/play").contentType(MediaType.APPLICATION_JSON).content("{\"moves\":[\"e2e5\"]}"))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(post("/api/chess/puzzles/0/try").contentType(MediaType.APPLICATION_JSON).content("{\"move\":\"a1a8\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.solved").value(true)).andExpect(jsonPath("$.san").value("Ra8#"));
        mvc.perform(get("/api/chess/openings")).andExpect(jsonPath("$.openings[0].id").value("catalan"));
    }

    @Test
    void countsOnlyKnownNames() throws Exception {
        mvc.perform(post("/api/counts/latte")).andExpect(status().isOk()).andExpect(jsonPath("$.count").value(1));
        mvc.perform(post("/api/counts/anything")).andExpect(status().isNotFound());
        mvc.perform(get("/api/counts")).andExpect(jsonPath("$.latte").value(1));
    }
    @Test
    void uploadsAreCheckedByTheirBytes() throws Exception {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 0, 0, 13};
        var res = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/admin/media/photo")
                        .file(new org.springframework.mock.web.MockMultipartFile("large", "a.png", "image/png", png))
                        .header("Authorization", "Bearer test-token"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String src = res.replaceAll(".*\"src\":\"([^\"]+)\".*", "$1");
        mvc.perform(get(src)).andExpect(status().isOk()).andExpect(header().string("Content-Type", "image/png"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/admin/media/photo")
                        .file(new org.springframework.mock.web.MockMultipartFile("large", "evil.png", "image/png", "<script>".getBytes()))
                        .header("Authorization", "Bearer test-token"))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/admin/media/track")
                        .file(new org.springframework.mock.web.MockMultipartFile("file", "a.mp3", "audio/mpeg", new byte[]{'I', 'D', '3', 4, 0, 0}))
                        .header("Authorization", "Bearer wrong"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/media/../site-data.json")).andExpect(status().isNotFound());
    }
}
