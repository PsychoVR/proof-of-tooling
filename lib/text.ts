// Untrusted free text (validator-info, tool names) is cleaned once, here, before it is stored.

// Control (Cc) and format (Cf) characters: zero-width, soft hyphen, bidi marks, overrides and
// isolates, Arabic letter mark, tag characters; line/paragraph separators (Zl, Zp); and the invisible
// fillers that are letters rather than formatting (Hangul fillers, combining grapheme joiner, Mongolian vowel separator).
const UNSAFE_CHARS = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180F\u2800\u3164\uFFA0\uFFFC\uFFFE\uFFFF]/gu;
// Variation selectors only change how the previous character is drawn, so they are dropped, not turned into spaces.
const VARIATION_SELECTORS = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu;
// More than two stacked combining marks is "zalgo" text that overflows its line.
const MARK_RUNS = /(\p{M}{2})\p{M}+/gu;
const INVISIBLE_ONLY = /[\p{M}\s]/gu;

/** Replaces unsafe characters with a space, collapses whitespace and caps the length in code points. */
export function sanitizeText(input: unknown, max = 255): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .replace(VARIATION_SELECTORS, "")
    .replace(UNSAFE_CHARS, " ")
    .replace(MARK_RUNS, "$1")
    .replace(/\s+/g, " ")
    .trim();
  // Nothing a reader could see (only marks and spaces left) counts as empty.
  if (!cleaned || cleaned.replace(INVISIBLE_ONLY, "") === "") return null;
  return Array.from(cleaned).slice(0, max).join("");
}
