package dev.seanward.site.api;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Cleaning and simple filtering for anything a visitor types. */
final class TextRules {

    private TextRules() {}

    private static final Pattern LINK = Pattern.compile("(https?://|www\\.|\\b[a-z0-9-]+\\.(com|net|org|io|xyz|ru|ly|gg|co)\\b)", Pattern.CASE_INSENSITIVE);
    // A short starting list; Sean can remove anything that slips through from the admin panel.
    private static final List<String> BLOCKED = List.of("nigg", "fag", "retard", "kys", "porn", "nazi");

    /** Keeps printable text and line breaks only, trimmed. */
    static String clean(String s) {
        return s == null ? "" : s.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").strip();
    }

    /** One line: no breaks, collapsed spaces. */
    static String oneLine(String s) {
        return clean(s).replaceAll("\\s+", " ");
    }

    static boolean hasLink(String s) {
        return LINK.matcher(s).find();
    }

    /** True when the text contains a blocked word, also when it's spaced out or disguised with accents. */
    static boolean blocked(String s) {
        String flat = Normalizer.normalize(s, Normalizer.Form.NFKD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
                .replace('0', 'o').replace('1', 'i').replace('3', 'e').replace('4', 'a').replace('5', 's').replace('@', 'a')
                .replaceAll("[^a-z]", "");
        return BLOCKED.stream().anyMatch(flat::contains);
    }
}
