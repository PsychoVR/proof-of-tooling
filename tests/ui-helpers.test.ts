import { describe, expect, it } from "vitest";
import { base58Length, buildClaimMessage, mockCheckClaim, validateIdentity, validateToolUrl } from "@/lib/ui/claim";
import { formatStake, safeHttpUrl } from "@/lib/ui/format";

describe("ui helpers", () => {
  it("only accepts plain http(s) urls", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("formats lamports without float loss", () => {
    expect(formatStake("900000000000000")).toBe("900,000 SOL");
    expect(formatStake("abc")).toBe("n/a");
  });

  it("decodes base58 lengths", () => {
    expect(base58Length("0OIl")).toBeNull();
    expect(base58Length("GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB")).toBe(32);
    expect(base58Length("11111111111111111111111111111111")).toBe(32);
  });

  it("rejects values that could break out of the shell command", () => {
    expect(validateToolUrl('github.com/a/b" ; rm -rf ~ #')).not.toBeNull();
    expect(validateToolUrl("github.com/a/b")).toBeNull();
    expect(validateIdentity("nope")).not.toBeNull();
    expect(validateIdentity("GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB")).toBeNull();
  });

  it("builds the v1 claim line and mock-checks the signature shape", () => {
    const msg = buildClaimMessage("https://github.com/a/b/", "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB", "2026-10-07");
    expect(msg).toBe("proof-of-tooling v1 | claim | github.com/a/b | GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB | 2026-10-07");
    expect(mockCheckClaim({ message: msg, signature: "short" }).ok).toBe(false);
  });
});

import { toolPillStatus } from "@/lib/ui/format";

describe("toolPillStatus", () => {
  const t = (status: "claimed" | "unclaimed", claims: { status: string; identity: string }[]) => ({ status, claims });
  it("shows signed, in review or unclaimed", () => {
    expect(toolPillStatus(t("claimed", []))).toBe("claimed");
    expect(toolPillStatus(t("unclaimed", [{ status: "pending", identity: "A" }]))).toBe("pending");
    expect(toolPillStatus(t("unclaimed", [{ status: "pending", identity: "A" }]), "B")).toBe("unclaimed");
    expect(toolPillStatus(t("unclaimed", [{ status: "stale", identity: "A" }]))).toBe("unclaimed");
  });
});

import { githubNewFileUrl, proofHint, proofJson, proofTarget } from "@/lib/ui/claim";

describe("proof file helpers", () => {
  const id = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
  it("builds the proof JSON", () => {
    expect(JSON.parse(proofJson(` ${id} `))).toEqual({ identities: [id] });
  });
  it("locates the proof file for repos and sites", () => {
    expect(proofTarget("https://www.GitHub.com/you/tool/")).toMatchObject({ kind: "repo", owner: "you", repo: "tool" });
    expect(proofTarget("pool.example.com/watch")).toMatchObject({ kind: "web", host: "pool.example.com", where: "https://pool.example.com/.well-known/proof-of-tooling.json" });
    expect(proofTarget("nonsense")).toBeNull();
    expect(proofHint("example.com")).toContain("https://example.com/.well-known/proof-of-tooling.json");
    expect(proofHint("github.com/you/tool")).toContain("github.com/you/tool/.proof-of-tooling.json");
    expect(proofHint("nonsense")).toBeNull();
  });
  it("prefills the GitHub new-file page", () => {
    const u = new URL(githubNewFileUrl("you", "tool", "main", id));
    expect(u.origin + u.pathname).toBe("https://github.com/you/tool/new/main");
    expect(u.searchParams.get("filename")).toBe(".proof-of-tooling.json");
    expect(JSON.parse(u.searchParams.get("value")!)).toEqual({ identities: [id] });
  });
});
