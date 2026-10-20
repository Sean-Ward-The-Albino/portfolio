package dev.seanward.site.chess;

import java.util.ArrayList;
import java.util.List;

/**
 * A chess position and the full FIDE rules for moving from it: castling (through and out of check forbidden),
 * en passant, promotion to any piece, and legality (no move may leave your own king in check).
 *
 * <p>Squares are 0..63 with a1 = 0, h1 = 7, a8 = 56. Pieces are +1..+6 for white (pawn, knight, bishop, rook,
 * queen, king) and -1..-6 for black. Positions are immutable: {@link #play} returns a new one.
 */
public final class Position {

    public static final int P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
    static final int WK_SIDE = 1, WQ_SIDE = 2, BK_SIDE = 4, BQ_SIDE = 8;
    public static final String START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    private static final int[][] KNIGHT_DF = {{1, 2}, {-1, 2}, {2, 1}, {-2, 1}, {1, -2}, {-1, -2}, {2, -1}, {-2, -1}};
    private static final int[][] KING_DF = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}};
    private static final int[][] ROOK_DF = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    private static final int[][] BISHOP_DF = {{1, 1}, {1, -1}, {-1, 1}, {-1, -1}};

    final int[] board;
    final boolean whiteToMove;
    final int castling;
    final int epSquare;      // the square a pawn may capture onto en passant, or -1
    final int halfmove;      // moves since the last capture or pawn move, for the fifty-move rule
    final int fullmove;

    Position(int[] board, boolean whiteToMove, int castling, int epSquare, int halfmove, int fullmove) {
        this.board = board;
        this.whiteToMove = whiteToMove;
        this.castling = castling;
        this.epSquare = epSquare;
        this.halfmove = halfmove;
        this.fullmove = fullmove;
    }

    /** A move. {@code promo} is the piece type a pawn becomes (N, B, R or Q), or 0. */
    public record Move(int from, int to, int promo) {
        public String uci() {
            return sq(from) + sq(to) + (promo == 0 ? "" : String.valueOf("  nbrq".charAt(promo)));
        }
    }

    public static String sq(int s) {
        return "" + (char) ('a' + s % 8) + (char) ('1' + s / 8);
    }

    static int file(int s) { return s & 7; }

    static int rank(int s) { return s >> 3; }

    static int at(int f, int r) { return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f; }

    public boolean whiteToMove() { return whiteToMove; }

    public int piece(int s) { return board[s]; }

    // ---------- FEN ----------

    public static Position fromFen(String fen) {
        String[] f = fen.trim().split("\\s+");
        if (f.length < 4) throw new IllegalArgumentException("FEN needs at least 4 fields");
        int[] b = new int[64];
        String[] rows = f[0].split("/");
        if (rows.length != 8) throw new IllegalArgumentException("FEN needs 8 ranks");
        int kings = 0;
        for (int r = 0; r < 8; r++) {
            int file = 0;
            for (char c : rows[7 - r].toCharArray()) {
                if (Character.isDigit(c)) { file += c - '0'; continue; }
                int t = "pnbrqk".indexOf(Character.toLowerCase(c)) + 1;
                if (t == 0 || file > 7) throw new IllegalArgumentException("Bad FEN piece");
                b[r * 8 + file++] = Character.isUpperCase(c) ? t : -t;
                if (t == K) kings++;
            }
            if (file != 8) throw new IllegalArgumentException("Bad FEN rank");
        }
        if (kings != 2) throw new IllegalArgumentException("Each side needs exactly one king");
        boolean white = f[1].equals("w");
        int castle = 0;
        if (f[2].contains("K")) castle |= WK_SIDE;
        if (f[2].contains("Q")) castle |= WQ_SIDE;
        if (f[2].contains("k")) castle |= BK_SIDE;
        if (f[2].contains("q")) castle |= BQ_SIDE;
        int ep = f[3].equals("-") ? -1 : (f[3].charAt(0) - 'a') + (f[3].charAt(1) - '1') * 8;
        int half = f.length > 4 ? Integer.parseInt(f[4]) : 0;
        int full = f.length > 5 ? Integer.parseInt(f[5]) : 1;
        return new Position(b, white, castle, ep, half, full);
    }

    public String fen() {
        return placementKey() + " " + halfmove + " " + fullmove;
    }

    /** Everything that makes two positions "the same" for repetition: pieces, side, castling, en passant. */
    String placementKey() {
        StringBuilder s = new StringBuilder();
        for (int r = 7; r >= 0; r--) {
            int empty = 0;
            for (int f = 0; f < 8; f++) {
                int p = board[r * 8 + f];
                if (p == 0) { empty++; continue; }
                if (empty > 0) { s.append(empty); empty = 0; }
                char c = " pnbrqk".charAt(Math.abs(p));
                s.append(p > 0 ? Character.toUpperCase(c) : c);
            }
            if (empty > 0) s.append(empty);
            if (r > 0) s.append('/');
        }
        s.append(whiteToMove ? " w " : " b ");
        String c = (castling & WK_SIDE) != 0 ? "K" : "";
        c += (castling & WQ_SIDE) != 0 ? "Q" : "";
        c += (castling & BK_SIDE) != 0 ? "k" : "";
        c += (castling & BQ_SIDE) != 0 ? "q" : "";
        s.append(c.isEmpty() ? "-" : c).append(' ');
        // FIDE counts en passant only when a capture is actually possible
        s.append(epSquare >= 0 && epCapturePossible() ? sq(epSquare) : "-");
        return s.toString();
    }

    private boolean epCapturePossible() {
        for (Move m : legalMoves()) if (m.to() == epSquare && Math.abs(board[m.from()]) == P) return true;
        return false;
    }

    // ---------- Attacks ----------

    /** True when {@code s} is attacked by the side given. */
    boolean attacked(int s, boolean byWhite) {
        int sign = byWhite ? 1 : -1, f = file(s), r = rank(s);
        // Pawns attack diagonally forward
        int pr = byWhite ? r - 1 : r + 1;
        for (int df : new int[]{-1, 1}) { int t = at(f + df, pr); if (t >= 0 && board[t] == sign * P) return true; }
        for (int[] d : KNIGHT_DF) { int t = at(f + d[0], r + d[1]); if (t >= 0 && board[t] == sign * N) return true; }
        for (int[] d : KING_DF) { int t = at(f + d[0], r + d[1]); if (t >= 0 && board[t] == sign * K) return true; }
        for (int[] d : ROOK_DF) if (slides(f, r, d, sign, R)) return true;
        for (int[] d : BISHOP_DF) if (slides(f, r, d, sign, B)) return true;
        return false;
    }

    private boolean slides(int f, int r, int[] d, int sign, int kind) {
        for (int k = 1; k < 8; k++) {
            int t = at(f + d[0] * k, r + d[1] * k);
            if (t < 0) return false;
            int p = board[t];
            if (p == 0) continue;
            return p == sign * kind || p == sign * Q;
        }
        return false;
    }

    int kingSquare(boolean white) {
        for (int s = 0; s < 64; s++) if (board[s] == (white ? K : -K)) return s;
        throw new IllegalStateException("No king");
    }

    public boolean inCheck() {
        return attacked(kingSquare(whiteToMove), !whiteToMove);
    }

    // ---------- Moves ----------

    public List<Move> legalMoves() {
        List<Move> out = new ArrayList<>();
        for (Move m : pseudoMoves()) {
            Position next = apply(m);
            if (!next.attacked(next.kingSquare(whiteToMove), next.whiteToMove)) out.add(m);
        }
        return out;
    }

    private List<Move> pseudoMoves() {
        List<Move> moves = new ArrayList<>(48);
        int sign = whiteToMove ? 1 : -1;
        for (int s = 0; s < 64; s++) {
            int p = board[s] * sign;
            if (p <= 0) continue;
            int f = file(s), r = rank(s);
            switch (p) {
                case P -> pawnMoves(s, f, r, sign, moves);
                case N -> { for (int[] d : KNIGHT_DF) step(s, at(f + d[0], r + d[1]), sign, moves); }
                case B -> slideMoves(s, f, r, BISHOP_DF, sign, moves);
                case R -> slideMoves(s, f, r, ROOK_DF, sign, moves);
                case Q -> { slideMoves(s, f, r, BISHOP_DF, sign, moves); slideMoves(s, f, r, ROOK_DF, sign, moves); }
                case K -> { for (int[] d : KING_DF) step(s, at(f + d[0], r + d[1]), sign, moves); castles(s, moves); }
                default -> { }
            }
        }
        return moves;
    }

    private void step(int from, int to, int sign, List<Move> moves) {
        if (to >= 0 && board[to] * sign <= 0) moves.add(new Move(from, to, 0));
    }

    private void slideMoves(int from, int f, int r, int[][] dirs, int sign, List<Move> moves) {
        for (int[] d : dirs) {
            for (int k = 1; k < 8; k++) {
                int t = at(f + d[0] * k, r + d[1] * k);
                if (t < 0) break;
                int p = board[t] * sign;
                if (p > 0) break;
                moves.add(new Move(from, t, 0));
                if (p < 0) break;
            }
        }
    }

    private void pawnMoves(int s, int f, int r, int sign, List<Move> moves) {
        int dir = sign, startRank = sign > 0 ? 1 : 6, lastRank = sign > 0 ? 7 : 0;
        int one = at(f, r + dir);
        if (one >= 0 && board[one] == 0) {
            addPawn(s, one, lastRank, moves);
            int two = at(f, r + 2 * dir);
            if (r == startRank && board[two] == 0) moves.add(new Move(s, two, 0));
        }
        for (int df : new int[]{-1, 1}) {
            int t = at(f + df, r + dir);
            if (t < 0) continue;
            if (board[t] * sign < 0) addPawn(s, t, lastRank, moves);
            else if (t == epSquare) moves.add(new Move(s, t, 0));
        }
    }

    private static void addPawn(int from, int to, int lastRank, List<Move> moves) {
        if (rank(to) == lastRank) for (int pr : new int[]{Q, R, B, N}) moves.add(new Move(from, to, pr));
        else moves.add(new Move(from, to, 0));
    }

    private void castles(int s, List<Move> moves) {
        boolean w = whiteToMove;
        int home = w ? 4 : 60;
        if (s != home || attacked(home, !w)) return;
        int kSide = w ? WK_SIDE : BK_SIDE, qSide = w ? WQ_SIDE : BQ_SIDE, rook = w ? R : -R;
        if ((castling & kSide) != 0 && board[home + 3] == rook && board[home + 1] == 0 && board[home + 2] == 0
                && !attacked(home + 1, !w) && !attacked(home + 2, !w)) moves.add(new Move(home, home + 2, 0));
        if ((castling & qSide) != 0 && board[home - 4] == rook && board[home - 1] == 0 && board[home - 2] == 0 && board[home - 3] == 0
                && !attacked(home - 1, !w) && !attacked(home - 2, !w)) moves.add(new Move(home, home - 2, 0));
    }

    /** Plays a move without checking it; use {@link #play} for moves from outside. */
    Position apply(Move m) {
        int[] b = board.clone();
        int p = b[m.from()], kind = Math.abs(p), sign = p > 0 ? 1 : -1;
        boolean capture = b[m.to()] != 0;
        b[m.to()] = m.promo() != 0 ? sign * m.promo() : p;
        b[m.from()] = 0;
        if (kind == P && m.to() == epSquare) { b[m.to() - 8 * sign] = 0; capture = true; }
        if (kind == K && Math.abs(m.to() - m.from()) == 2) {
            // Castling: move the rook too
            if (m.to() > m.from()) { b[m.from() + 1] = b[m.from() + 3]; b[m.from() + 3] = 0; }
            else { b[m.from() - 1] = b[m.from() - 4]; b[m.from() - 4] = 0; }
        }
        int c = castling;
        for (int sq : new int[]{m.from(), m.to()}) {
            if (sq == 4) c &= ~(WK_SIDE | WQ_SIDE);
            if (sq == 60) c &= ~(BK_SIDE | BQ_SIDE);
            if (sq == 7) c &= ~WK_SIDE;
            if (sq == 0) c &= ~WQ_SIDE;
            if (sq == 63) c &= ~BK_SIDE;
            if (sq == 56) c &= ~BQ_SIDE;
        }
        int ep = kind == P && Math.abs(m.to() - m.from()) == 16 ? (m.from() + m.to()) / 2 : -1;
        int half = kind == P || capture ? 0 : halfmove + 1;
        return new Position(b, !whiteToMove, c, ep, half, whiteToMove ? fullmove : fullmove + 1);
    }

    /** Plays a move given in UCI form (e2e4, e7e8q), or throws if it isn't legal here. */
    public Position play(String uci) {
        return apply(parse(uci));
    }

    public Move parse(String uci) {
        if (uci == null || !uci.matches("^[a-h][1-8][a-h][1-8][nbrq]?$")) throw new IllegalArgumentException("Not a move: " + uci);
        for (Move m : legalMoves()) if (m.uci().equals(uci)) return m;
        throw new IllegalArgumentException("Illegal move: " + uci);
    }

    // ---------- Notation ----------

    /** Standard algebraic notation, with disambiguation and + or # where needed. */
    public String san(Move m) {
        int p = Math.abs(board[m.from()]);
        String s;
        if (p == K && Math.abs(m.to() - m.from()) == 2) s = m.to() > m.from() ? "O-O" : "O-O-O";
        else {
            boolean capture = board[m.to()] != 0 || (p == P && m.to() == epSquare);
            StringBuilder b = new StringBuilder();
            if (p == P) {
                if (capture) b.append((char) ('a' + file(m.from())));
            } else {
                b.append(" PNBRQK".charAt(p));
                boolean sameFile = false, sameRank = false, other = false;
                for (Move o : legalMoves()) {
                    if (o.equals(m) || o.to() != m.to() || Math.abs(board[o.from()]) != p) continue;
                    other = true;
                    if (file(o.from()) == file(m.from())) sameFile = true;
                    if (rank(o.from()) == rank(m.from())) sameRank = true;
                }
                if (other) {
                    if (!sameFile) b.append((char) ('a' + file(m.from())));
                    else if (!sameRank) b.append((char) ('1' + rank(m.from())));
                    else b.append(sq(m.from()));
                }
            }
            if (capture) b.append('x');
            b.append(sq(m.to()));
            if (m.promo() != 0) b.append('=').append(" PNBRQK".charAt(m.promo()));
            s = b.toString();
        }
        Position next = apply(m);
        if (next.inCheck()) s += next.legalMoves().isEmpty() ? "#" : "+";
        return s;
    }

    /** Finds the legal move written in SAN (checks and annotations are ignored). */
    public Move fromSan(String san) {
        String want = san.replaceAll("[+#!?]", "").replace("0-0-0", "O-O-O").replace("0-0", "O-O");
        for (Move m : legalMoves()) if (san(m).replaceAll("[+#]", "").equals(want)) return m;
        throw new IllegalArgumentException("No legal move " + san + " in " + fen());
    }

    /** Neither side can possibly checkmate: K v K, K+minor v K, or K+B v K+B with bishops on the same colour. */
    public boolean insufficientMaterial() {
        List<Integer> minors = new ArrayList<>();
        List<Integer> bishopColours = new ArrayList<>();
        for (int s = 0; s < 64; s++) {
            int k = Math.abs(board[s]);
            if (k == 0 || k == K) continue;
            if (k == P || k == R || k == Q) return false;
            minors.add(k);
            if (k == B) bishopColours.add((file(s) + rank(s)) % 2);
        }
        if (minors.size() <= 1) return true;
        return minors.stream().allMatch(k -> k == B) && bishopColours.stream().distinct().count() == 1;
    }
}
