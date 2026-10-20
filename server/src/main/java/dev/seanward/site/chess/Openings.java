package dev.seanward.site.chess;

import java.util.ArrayList;
import java.util.List;

/** Sean's openings, as lines to practise. Each is checked move by move against the rules when the server starts. */
public final class Openings {

    public record Line(String id, String name, String side, String note, List<String> san, List<String> uci) {}

    private record Raw(String id, String name, String side, String note, String moves) {}

    private static final List<Raw> RAW = List.of(
            new Raw("catalan", "The Catalan", "white", "My favourite as white. This is the Open Catalan, where black takes on c4.",
                    "d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7 Bd2"),
            new Raw("sicilian", "The Sicilian", "black", "What I play as black against e4. This is the Najdorf.",
                    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"),
            new Raw("vs-d4", "Against d4", "black", "Against d4 I usually play d5, e6 and Nf6.",
                    "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3"));

    public static final List<Line> ALL = build();

    private Openings() {}

    private static List<Line> build() {
        List<Line> out = new ArrayList<>();
        for (Raw r : RAW) {
            Position p = Position.fromFen(Position.START);
            List<String> san = new ArrayList<>(), uci = new ArrayList<>();
            for (String s : r.moves().split(" ")) {
                Position.Move m = p.fromSan(s);
                san.add(p.san(m));
                uci.add(m.uci());
                p = p.apply(m);
            }
            out.add(new Line(r.id(), r.name(), r.side(), r.note(), List.copyOf(san), List.copyOf(uci)));
        }
        return List.copyOf(out);
    }
}
