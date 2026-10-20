package dev.seanward.site.chess;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A game replayed from a start position and a list of moves, so every rule that depends on history works:
 * threefold and fivefold repetition, and the fifty- and seventy-five-move rules.
 *
 * <p>As in FIDE's Laws: checkmate, stalemate, a dead position, fivefold repetition and seventy-five moves without a
 * capture or pawn move end the game on their own. Threefold repetition and the fifty-move rule only make a draw
 * available to claim.
 */
public final class Game {

    public enum Status { PLAYING, CHECKMATE, STALEMATE, DRAW }

    public static final int MAX_MOVES = 600;

    private final Position position;
    private final List<String> san;
    private final Status status;
    private final String reason;
    private final List<String> claimable;

    private Game(Position position, List<String> san, Status status, String reason, List<String> claimable) {
        this.position = position;
        this.san = san;
        this.status = status;
        this.reason = reason;
        this.claimable = claimable;
    }

    public static Game replay(String startFen, List<String> moves) {
        if (moves.size() > MAX_MOVES) throw new IllegalArgumentException("Too many moves");
        Position p = Position.fromFen(startFen);
        if (p.attacked(p.kingSquare(!p.whiteToMove), p.whiteToMove)) throw new IllegalArgumentException("The side not to move is in check");
        Map<String, Integer> seen = new HashMap<>();
        seen.merge(p.placementKey(), 1, Integer::sum);
        List<String> san = new ArrayList<>();
        int maxRepeat = 1;
        for (String uci : moves) {
            Position.Move m = p.parse(uci);
            san.add(p.san(m));
            p = p.apply(m);
            maxRepeat = Math.max(maxRepeat, seen.merge(p.placementKey(), 1, Integer::sum));
        }
        int repeats = seen.getOrDefault(p.placementKey(), 1);
        List<Position.Move> legal = p.legalMoves();
        Status status = Status.PLAYING;
        String reason = null;
        if (legal.isEmpty()) {
            status = p.inCheck() ? Status.CHECKMATE : Status.STALEMATE;
            reason = p.inCheck() ? "checkmate" : "stalemate";
        } else if (p.insufficientMaterial()) { status = Status.DRAW; reason = "dead position"; }
        else if (repeats >= 5) { status = Status.DRAW; reason = "fivefold repetition"; }
        else if (p.halfmove >= 150) { status = Status.DRAW; reason = "seventy-five-move rule"; }
        List<String> claim = new ArrayList<>();
        if (status == Status.PLAYING) {
            if (repeats >= 3) claim.add("threefold repetition");
            if (p.halfmove >= 100) claim.add("fifty-move rule");
        }
        return new Game(p, san, status, reason, claim);
    }

    public Position position() { return position; }

    public List<String> san() { return san; }

    public Status status() { return status; }

    public String reason() { return reason; }

    public List<String> claimable() { return claimable; }
}
