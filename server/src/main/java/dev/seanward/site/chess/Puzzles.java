package dev.seanward.site.chess;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/**
 * Mate-in-one puzzles. Any move that gives checkmate solves it, so there's no single "right" answer to memorise; the
 * rules engine decides. A new one each day, on San Diego time.
 */
public final class Puzzles {

    public record Puzzle(int id, String title, String fen, String hint) {}

    public static final List<Puzzle> ALL = List.of(
            new Puzzle(0, "The back rank", "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", "The king's own pawns are its prison."),
            new Puzzle(1, "Smothered", "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1", "A knight can jump where nothing else can reach."),
            new Puzzle(2, "Scholar's mate", "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", "f7 is only defended by the king."),
            new Puzzle(3, "Promotion", "7k/5P2/6K1/8/8/8/8/8 w - - 0 1", "A pawn on the seventh wants to become something."),
            new Puzzle(4, "King and queen", "7k/4Q3/6K1/8/8/8/8/8 w - - 0 1", "Your king can protect your queen, or keep the escape squares covered."),
            new Puzzle(5, "Black to play", "3r2k1/8/8/8/8/8/5PPP/6K1 b - - 0 1", "The same trap works for black."));

    private Puzzles() {}

    public static Puzzle today() {
        long day = LocalDate.now(ZoneId.of("America/Los_Angeles")).toEpochDay();
        return ALL.get((int) Math.floorMod(day, ALL.size()));
    }

    /** True when the move is legal and gives checkmate. */
    public static boolean solves(Puzzle p, String uci) {
        Position pos = Position.fromFen(p.fen());
        Position after = pos.play(uci);
        return after.inCheck() && after.legalMoves().isEmpty();
    }
}
