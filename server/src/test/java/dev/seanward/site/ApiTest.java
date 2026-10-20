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
}
