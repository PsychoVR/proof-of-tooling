import { describe, expect, it } from "vitest";
import { dnsTxtValue, metaTag, nextTabIndex, proofHint, proofTarget } from "@/lib/ui/claim";

describe("proof method helpers", () => {
  const id = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

  it("builds the DNS TXT and meta values", () => {
    expect(dnsTxtValue(` ${id} `)).toBe(`proof-of-tooling=${id}`);
    expect(metaTag(id)).toBe(`<meta name="proof-of-tooling" content="${id}">`);
  });

  it("lists the account-level repos of the claimed owner", () => {
    expect(proofTarget("github.com/you/tool")).toMatchObject({ accountRepos: ["github.com/you/.github", "github.com/you/you"] });
  });

  it("names every accepted location in the failure hint", () => {
    const repo = proofHint("github.com/you/tool")!;
    for (const s of ["github.com/you/tool/.proof-of-tooling.json", "github.com/you/.github", "github.com/you/you", "covers all your repos"]) {
      expect(repo).toContain(s);
    }
    const web = proofHint("pool.example.com/watch", id)!;
    for (const s of [
      "https://pool.example.com/.well-known/proof-of-tooling.json",
      `proof-of-tooling=${id} on pool.example.com`,
      metaTag(id),
      "https://pool.example.com/",
    ]) {
      expect(web).toContain(s);
    }
    expect(proofHint("pool.example.com")).toContain("<identity>");
  });

  it("moves between tabs with the arrow keys", () => {
    expect(nextTabIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextTabIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextTabIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextTabIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextTabIndex(1, "ArrowUp", 3)).toBe(0);
    expect(nextTabIndex(1, "Home", 3)).toBe(0);
    expect(nextTabIndex(1, "End", 3)).toBe(2);
    expect(nextTabIndex(1, "a", 3)).toBeNull();
  });
});

import { SIGN_METHODS, signCommand, signCommandLedger } from "@/lib/ui/claim";

describe("sign command variants", () => {
  it("uses the same quoted message for a key file and a Ledger", () => {
    const m = "proof-of-tooling v1 | claim | github.com/a/b | id | 2026-10-07";
    expect(signCommand(m)).toBe(`solana sign-offchain-message -k ~/validator-keypair.json "${m}"`);
    expect(signCommandLedger(m)).toBe(`solana sign-offchain-message -k usb://ledger "${m}"`);
    expect(SIGN_METHODS.map((s) => s.id)).toEqual(["file", "ledger", "remote"]);
  });
});
