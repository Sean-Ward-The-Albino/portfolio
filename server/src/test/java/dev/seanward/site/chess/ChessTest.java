package dev.seanward.site.chess;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

/** Perft counts every legal move sequence to a depth; matching the published numbers proves the rules are right. */
class ChessTest {

    static long perft(Position p, int depth) {
        if (depth == 0) return 1;
        long n = 0;
        for (Position.Move m : p.legalMoves()) n += perft(p.apply(m), depth - 1);
        return n;
    }

    @Test
    void startPosition() {
        Position p = Position.fromFen(Position.START);
        assertThat(perft(p, 1)).isEqualTo(20);
        assertThat(perft(p, 2)).isEqualTo(400);
        assertThat(perft(p, 3)).isEqualTo(8902);
        assertThat(perft(p, 4)).isEqualTo(197281);
    }

    @Test
    void kiwipeteCastlingEnPassantPromotion() {
        Position p = Position.fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
        assertThat(perft(p, 1)).isEqualTo(48);
        assertThat(perft(p, 2)).isEqualTo(2039);
        assertThat(perft(p, 3)).isEqualTo(97862);
    }

    @Test
    void enPassantPinsAndChecks() {
        Position p = Position.fromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
        assertThat(perft(p, 1)).isEqualTo(14);
        assertThat(perft(p, 2)).isEqualTo(191);
        assertThat(perft(p, 3)).isEqualTo(2812);
        assertThat(perft(p, 4)).isEqualTo(43238);
    }

    @Test
    void promotionsAndUnderpromotions() {
        Position p = Position.fromFen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1");
        assertThat(perft(p, 1)).isEqualTo(6);
        assertThat(perft(p, 2)).isEqualTo(264);
        assertThat(perft(p, 3)).isEqualTo(9467);
    }

    @Test
    void enPassantCapture() {
        Game g = Game.replay(Position.START, List.of("e2e4", "a7a6", "e4e5", "d7d5", "e5d6"));
        assertThat(g.san()).last().isEqualTo("exd6");
        assertThat(g.position().piece(35)).isZero(); // the captured pawn on d5 is gone
    }

    @Test
    void cannotCastleThroughCheck() {
        // A black bishop covers f1, so white may not castle kingside
        Position p = Position.fromFen("4k3/8/8/8/8/8/6b1/4K2R w K - 0 1");
        assertThat(p.legalMoves()).noneMatch(m -> m.uci().equals("e1g1"));
    }

    @Test
    void stalemateAndThreefold() {
        assertThat(Game.replay("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", List.of()).status()).isEqualTo(Game.Status.STALEMATE);
        Game g = Game.replay(Position.START, List.of("g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"));
        assertThat(g.claimable()).contains("threefold repetition");
        assertThat(Game.replay("8/8/8/4k3/8/8/8/4K1N1 w - - 0 1", List.of()).reason()).isEqualTo("dead position");
    }

    @Test
    void sanAndIllegalMoves() {
        Game g = Game.replay(Position.START, List.of("e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"));
        assertThat(g.san()).last().isEqualTo("Qxf7#");
        assertThat(g.status()).isEqualTo(Game.Status.CHECKMATE);
        assertThatThrownBy(() -> Game.replay(Position.START, List.of("e2e5"))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void everyPuzzleHasAMateAndIsLegal() {
        for (Puzzles.Puzzle pz : Puzzles.ALL) {
            Position p = Position.fromFen(pz.fen());
            Game.replay(pz.fen(), List.of()); // throws if the side not to move is in check
            assertThat(p.legalMoves()).as(pz.title()).anyMatch(m -> Puzzles.solves(pz, m.uci()));
        }
    }

    @Test
    void openingsAreLegal() {
        assertThat(Openings.ALL).hasSize(3);
        assertThat(Openings.ALL.get(0).san()).startsWith("d4", "Nf6", "c4");
    }
}
