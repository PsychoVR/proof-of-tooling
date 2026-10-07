import { describe, expect, it } from "vitest";
import { sanitizeText } from "@/lib/text";

describe("sanitizeText hardening (N11)", () => {
  it("turns private-use, unassigned, lone surrogate and object-replacement characters into spaces", () => {
    expect(sanitizeText("ab")).toBe("a b"); // Co
    expect(sanitizeText("a\u{F0000}b")).toBe("a b"); // plane 15 private use
    expect(sanitizeText("a͸b")).toBe("a b"); // Cn (unassigned)
    expect(sanitizeText("a\uD800b")).toBe("a b"); // lone surrogate
    expect(sanitizeText("a￼b")).toBe("a b");
    expect(sanitizeText("a￾b￿")).toBe("a b");
  });

  it("neutralizes braille blank, Mongolian free variation selectors and invisible fillers", () => {
    expect(sanitizeText("a⠀b")).toBe("a b");
    expect(sanitizeText("a᠋b᠏c")).toBe("a b c");
    expect(sanitizeText("⠀⠀⠀")).toBeNull();
    expect(sanitizeText("ㅤﾠ")).toBeNull();
  });

  it("drops variation selectors (both ranges) without leaving gaps", () => {
    expect(sanitizeText("a️b")).toBe("ab");
    expect(sanitizeText("a\u{E0100}b\u{E01EF}")).toBe("ab");
    expect(sanitizeText("️︀")).toBeNull();
  });

  it("limits stacked combining marks to two", () => {
    const zalgo = "Z" + "̀́̂̃̄̅̆".repeat(10) + "algo";
    const out = sanitizeText(zalgo)!;
    expect(out).toBe("Z̀́algo");
    expect(sanitizeText("é")).toBe("é".normalize("NFD")); // one legitimate accent is untouched
  });

  it("returns null when only marks and spaces remain", () => {
    expect(sanitizeText("̀́ ̂")).toBeNull();
    expect(sanitizeText(" ́ ")).toBeNull();
    expect(sanitizeText("á")).not.toBeNull();
  });

  it("keeps legitimate text: emoji, Devanagari and Thai marks", () => {
    for (const t of ["Validators 🚀", "नमस्ते", "สวัสดี", "Zoë"]) expect(sanitizeText(t)).toBe(t);
  });
});
