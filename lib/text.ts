// Untrusted free text (validator-info, tool names) is cleaned once, here, before it is stored.

// Control (Cc) and format (Cf) characters: zero-width, soft hyphen, bidi marks, overrides and
// isolates, Arabic letter mark, tag characters; line/paragraph separators (Zl, Zp); and the invisible
// fillers that are letters rather than formatting (Hangul fillers, combining grapheme joiner, Mongolian vowel separator).
const UNSAFE_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}͏ᅟᅠ឴឵᠎ㅤﾠ]/gu;

/** Replaces unsafe characters with a space, collapses whitespace and caps the length in code points. */
export function sanitizeText(input: unknown, max = 255): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return Array.from(cleaned).slice(0, max).join("");
}
