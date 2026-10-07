import { describe, expect, it } from "vitest";
import { sanitizeText } from "@/lib/text";

describe("sanitizeText", () => {
  it("replaces control, bidi, zero-width, soft hyphen and tag characters", () => {
    const cases: [string, string][] = [
      ["a\u0000b", "a b"],
      ["a‮b", "a b"], // RLO
      ["a⁦b", "a b"], // LRI
      ["a​b", "a b"], // zero-width space
      ["a­b", "a b"], // soft hyphen
      ["a؜b", "a b"], // Arabic letter mark
      ["a͏b", "a b"], // combining grapheme joiner
      ["a᠎b", "a b"], // Mongolian vowel separator
      ["aㅤb", "a b"], // Hangul filler
      ["aﾠb", "a b"], // halfwidth Hangul filler
      ["a\u{E0041}b", "a b"], // tag character
      ["a b", "a b"], // line separator
      ["a﻿b", "a b"], // BOM
    ];
    for (const [input, out] of cases) expect(sanitizeText(input)).toBe(out);
  });

  it("keeps ordinary text, accents, emoji and non-latin scripts", () => {
    for (const t of ["Overclock", "Pumpkin's Pool", "Café Staking", "日本語バリデータ", "Validators 🚀"]) expect(sanitizeText(t)).toBe(t);
  });

  it("collapses whitespace, trims, caps by code points and rejects non-strings and blanks", () => {
    expect(sanitizeText("  a \n\t b  ")).toBe("a b");
    expect(Array.from(sanitizeText("🚀".repeat(300))!)).toHaveLength(255);
    expect(sanitizeText("x".repeat(300), 80)).toHaveLength(80);
    for (const v of [5, null, undefined, "", "   ", "​‮"]) expect(sanitizeText(v)).toBeNull();
  });
});
