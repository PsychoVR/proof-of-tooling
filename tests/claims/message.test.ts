import { describe, expect, it } from "vitest";
import {
  buildClaimMessage,
  isValidDate,
  normalizeToolUrl,
  parseClaimMessage,
  serializeOffchainV0,
} from "@/lib/claims";

const ID = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const line = `proof-of-tooling v1 | claim | github.com/org/repo | ${ID} | 2026-10-06`;

describe("normalizeToolUrl", () => {
  it("strips scheme and trailing slashes, lowercases the host only", () => {
    expect(normalizeToolUrl("  HTTPS://GitHub.com/Org/Repo// ")).toBe("github.com/Org/Repo");
    expect(normalizeToolUrl("http://Example.COM/")).toBe("example.com");
    expect(normalizeToolUrl("example.com")).toBe("example.com");
  });
});

describe("isValidDate", () => {
  it("validates calendar dates", () => {
    expect(isValidDate("2026-10-06")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-1-6")).toBe(false);
  });
});

describe("buildClaimMessage / parseClaimMessage", () => {
  it("builds the canonical line", () => {
    expect(buildClaimMessage({ action: "claim", toolUrl: "https://github.com/org/repo/", identity: ID, date: "2026-10-06" })).toBe(line);
  });

  it("round-trips with extras", () => {
    const m = buildClaimMessage({ action: "unclaim", toolUrl: "a.io", identity: ID, date: "2026-10-06", extras: { tip: "abc", n: "1" } });
    expect(parseClaimMessage(m)).toEqual({
      action: "unclaim",
      toolUrl: "a.io",
      identity: ID,
      date: "2026-10-06",
      extras: { tip: "abc", n: "1" },
    });
  });

  it("parses the plain claim", () => {
    expect(parseClaimMessage(line)).toMatchObject({ action: "claim", toolUrl: "github.com/org/repo", extras: {} });
  });

  it.each([
    ["non-ASCII", line + " | k=é"],
    ["empty", ""],
    ["too few parts", "proof-of-tooling v1 | claim | github.com/org/repo"],
    ["wrong prefix", line.replace("v1", "v2")],
    ["bad action", line.replace("| claim |", "| endorse |")],
    ["empty url", line.replace("github.com/org/repo", "")],
    ["url with spaces", line.replace("github.com/org/repo", "git hub.com/a")],
    ["bad identity", line.replace(ID, "short")],
    ["bad date", line.replace("2026-10-06", "2026-13-06")],
    ["extra without equals", line + " | nokv"],
    ["extra with bad key", line + " | Bad=1"],
    ["duplicate extra", line + " | a=1 | a=2"],
  ])("rejects %s", (_n, m) => {
    expect(parseClaimMessage(m)).toBeNull();
  });
});

describe("serializeOffchainV0", () => {
  it("writes the restricted ASCII envelope", () => {
    const out = serializeOffchainV0("hi");
    expect(Array.from(out.slice(0, 16))).toEqual([0xff, ...Array.from("solana offchain", (c) => c.charCodeAt(0))]);
    expect(Array.from(out.slice(16))).toEqual([0, 0, 2, 0, 0x68, 0x69]);
  });

  it("uses format 1 for UTF-8 messages", () => {
    const out = serializeOffchainV0("hé");
    expect(out[17]).toBe(1);
    expect(out[18]).toBe(3); // byte length, not char count
  });

  it("encodes lengths above 255 as u16 little-endian", () => {
    const out = serializeOffchainV0("a".repeat(300));
    expect([out[18], out[19]]).toEqual([300 & 255, 1]);
  });

  it("rejects empty messages and messages over 1212 bytes", () => {
    expect(() => serializeOffchainV0("")).toThrow(RangeError);
    expect(serializeOffchainV0("a".repeat(1212)).length).toBe(1232);
    expect(() => serializeOffchainV0("a".repeat(1213))).toThrow(RangeError);
  });
});
