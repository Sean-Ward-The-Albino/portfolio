package dev.seanward.site.api;

import dev.seanward.site.chess.Game;
import dev.seanward.site.chess.Openings;
import dev.seanward.site.chess.Position;
import dev.seanward.site.chess.Puzzles;
import dev.seanward.site.store.SiteStore;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Chess by the full FIDE rules, worked out on the server. The browser sends where a game started and the moves so
 * far; the server answers with the position, every legal move, and whether the game is over and why.
 */
@RestController
public class ChessController {

    public record PlayRequest(@Size(max = 100) String start, @Size(max = Game.MAX_MOVES) List<@Size(max = 5) String> moves) {}

    public record TryRequest(@Size(max = 5) String move) {}

    private final RateLimiter limiter;
    private final ClientKeys keys;
    private final SiteStore store;

    public ChessController(RateLimiter limiter, ClientKeys keys, SiteStore store) {
        this.limiter = limiter;
        this.keys = keys;
        this.store = store;
    }

    @PostMapping("/api/chess/play")
    public ResponseEntity<?> play(@Valid @RequestBody PlayRequest body, HttpServletRequest request) {
        if (!limiter.allow("chess:" + keys.keyFor(request), 240, Duration.ofMinutes(1))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "too_many"));
        }
        try {
            Game g = Game.replay(body.start() == null || body.start().isBlank() ? Position.START : body.start(), body.moves() == null ? List.of() : body.moves());
            return ResponseEntity.ok(describe(g));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.unprocessableContent().body(Map.of("error", "illegal", "detail", e.getMessage()));
        }
    }

    static Map<String, Object> describe(Game g) {
        Position p = g.position();
        List<Map<String, Object>> legal = new ArrayList<>();
        if (g.status() == Game.Status.PLAYING) {
            for (Position.Move m : p.legalMoves()) legal.add(Map.of("uci", m.uci(), "san", p.san(m)));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("fen", p.fen());
        out.put("turn", p.whiteToMove() ? "white" : "black");
        out.put("check", p.inCheck());
        out.put("status", g.status().name().toLowerCase());
        out.put("reason", g.reason());
        out.put("claimable", g.claimable());
        out.put("san", g.san());
        out.put("legal", legal);
        return out;
    }

    @GetMapping("/api/chess/puzzles")
    public ResponseEntity<?> puzzles() {
        Puzzles.Puzzle today = Puzzles.today();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)))
                .body(Map.of("today", today.id(), "puzzles", Puzzles.ALL, "solved", store.counts().getOrDefault("puzzle", 0L)));
    }

    @PostMapping("/api/chess/puzzles/{id}/try")
    public ResponseEntity<?> attempt(@PathVariable int id, @Valid @RequestBody TryRequest body, HttpServletRequest request) {
        if (id < 0 || id >= Puzzles.ALL.size()) return ResponseEntity.notFound().build();
        if (!limiter.allow("chess:" + keys.keyFor(request), 240, Duration.ofMinutes(1))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("error", "too_many"));
        }
        Puzzles.Puzzle pz = Puzzles.ALL.get(id);
        try {
            Position pos = Position.fromFen(pz.fen());
            Position.Move m = pos.parse(body.move());
            boolean solved = Puzzles.solves(pz, body.move());
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("solved", solved);
            out.put("san", pos.san(m));
            out.put("fen", pos.play(body.move()).fen());
            if (solved && limiter.allow("puzzle-count:" + id + ":" + keys.keyFor(request), 1, Duration.ofDays(1))) store.increment("puzzle");
            return ResponseEntity.ok(out);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.unprocessableContent().body(Map.of("error", "illegal"));
        }
    }

    @GetMapping("/api/chess/openings")
    public ResponseEntity<?> openings() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1))).body(Map.of("openings", Openings.ALL));
    }
}
