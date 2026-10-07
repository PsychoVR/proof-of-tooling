import nacl from "tweetnacl";
import bs58 from "bs58";
import { describe, expect, it, vi } from "vitest";
import { serializeOffchainV0, verifyClaimSignature } from "@/lib/claims";

// Known vector from the design prototype (DEMO constant).
const DEMO = {
  pk: "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB",
  sig: "3mDMjcmqN9DhAaUDL1MFJAmrd2wzkWpQU4obWEVWa7AqkW9Umj2uf8eLcPqacvQqe7ZkQwmSAMwHE5LWVDxKCHVu",
  date: "2026-10-06",
  message:
    "proof-of-tooling v1 | claim | github.com/example/demo-tool | GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB | 2026-10-06",
};
const NOW = new Date("2026-10-07T12:00:00Z");
const base = { message: DEMO.message, signature: DEMO.sig, identity: DEMO.pk, now: NOW };
const failed = (r: ReturnType<typeof verifyClaimSignature>) => r.checks.find((c) => !c.ok)?.id;

describe("verifyClaimSignature", () => {
  it("verifies the DEMO vector and reports each check", () => {
    const r = verifyClaimSignature(base);
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => [c.id, c.ok])).toEqual([
      ["format", true],
      ["date", true],
      ["encoding", true],
      ["signature", true],
    ]);
  });

  it("uses the real clock when none is injected", () => {
    vi.useFakeTimers({ now: new Date("2027-01-01T00:00:00Z") });
    try {
      expect(failed(verifyClaimSignature({ ...base, now: undefined }))).toBe("date");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the DEMO signature is over the off-chain envelope, not the raw bytes", () => {
    const pk = bs58.decode(DEMO.pk);
    const sig = bs58.decode(DEMO.sig);
    expect(nacl.sign.detached.verify(serializeOffchainV0(DEMO.message), sig, pk)).toBe(true);
    expect(nacl.sign.detached.verify(new TextEncoder().encode(DEMO.message), sig, pk)).toBe(false);
  });

  it("rejects a message altered by one character", () => {
    const r = verifyClaimSignature({ ...base, message: DEMO.message.replace("demo-tool", "demo-tooL") });
    expect(r.ok).toBe(false);
    expect(failed(r)).toBe("signature");
  });

  it("rejects a signature altered by one character", () => {
    const sig = DEMO.sig.slice(0, -1) + (DEMO.sig.endsWith("u") ? "v" : "u");
    expect(failed(verifyClaimSignature({ ...base, signature: sig }))).toBe("signature");
  });

  it("flags a malformed message as a format error", () => {
    expect(failed(verifyClaimSignature({ ...base, message: "hello" }))).toBe("format");
  });

  it("flags a non-ASCII message as a format error", () => {
    expect(failed(verifyClaimSignature({ ...base, message: DEMO.message + " | k=é" }))).toBe("format");
  });

  it("flags an identity that differs from the one in the message", () => {
    const other = "11111111111111111111111111111111";
    const r = verifyClaimSignature({ ...base, identity: other });
    expect(failed(r)).toBe("format");
  });

  it("accepts a date exactly 7 days old and rejects 8", () => {
    expect(verifyClaimSignature({ ...base, now: new Date("2026-10-13T23:59:00Z") }).ok).toBe(true);
    const r = verifyClaimSignature({ ...base, now: new Date("2026-10-14T00:00:00Z") });
    expect(failed(r)).toBe("date");
    expect(r.checks.at(-1)?.detail).toContain("8 days");
  });

  it("rejects dates too far in the future but tolerates one day", () => {
    expect(verifyClaimSignature({ ...base, now: new Date("2026-10-05T10:00:00Z") }).ok).toBe(true);
    expect(failed(verifyClaimSignature({ ...base, now: new Date("2026-10-04T10:00:00Z") }))).toBe("date");
  });

  it("returns an encoding error for a bad identity length instead of throwing", () => {
    const short = "1111111111111111111111111111111"; // 31 chars, decodes to 31 bytes
    const message = DEMO.message.replace(DEMO.pk, short);
    // 31 chars is rejected by the format check; use a 32-char key that decodes to 24 bytes.
    const key = "2".repeat(32);
    const m2 = DEMO.message.replace(DEMO.pk, key);
    expect(failed(verifyClaimSignature({ ...base, message, identity: short }))).toBe("format");
    expect(failed(verifyClaimSignature({ ...base, message: m2, identity: key }))).toBe("encoding");
  });

  it("returns an encoding error for non-base58 or wrong-length signatures", () => {
    for (const signature of ["", "0OIl", "abc", bs58.encode(new Uint8Array(63)), bs58.encode(new Uint8Array(65))]) {
      expect(failed(verifyClaimSignature({ ...base, signature }))).toBe("encoding");
    }
  });

  // Pending real fixtures from the CLI (docs/fixtures/cli-signatures.json does not exist yet).
  it.todo("CLI fixture: valid-claim verifies with the clock fixed to signedOn");
  it.todo("CLI fixture: stale-date yields a date error");
  it.todo("CLI fixture: valid-unclaim verifies");
  it.todo("a signature over the raw message bytes is rejected (needs a raw-signed fixture)");
});
