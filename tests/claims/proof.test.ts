import { describe, expect, it, vi } from "vitest";
import { checkProofFile, proofFileUrl, registrableDomain } from "@/lib/claims";
import { MAX_PROOF_BYTES } from "@/lib/claims/proof";

const ID = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const noTxt = async (): Promise<string[][]> => [];
const ok = (body: unknown, status = 200) => vi.fn(async () => ({ status, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("proofFileUrl", () => {
  it("maps GitHub repos to the raw file on the default branch", () => {
    expect(proofFileUrl("github.com/org/repo")).toEqual({
      kind: "repo",
      url: "https://raw.githubusercontent.com/org/repo/HEAD/.proof-of-tooling.json",
    });
  });

  it("maps a web tool with a path to the well-known file at the root of its domain", () => {
    for (const u of ["pumpkinspool.com/watchtower", "pumpkinspool.com/watchtower/rugs", "ag.validblocks.com", "a.b.example.co.uk/x/y"]) {
      const host = u.split("/")[0];
      expect(proofFileUrl(u)).toEqual({ kind: "web", url: `https://${host}/.well-known/proof-of-tooling.json` });
    }
  });

  it("maps bare domains to the well-known path", () => {
    expect(proofFileUrl("tool.example.com")).toEqual({
      kind: "web",
      url: "https://tool.example.com/.well-known/proof-of-tooling.json",
    });
  });

  it.each([
    "github.com",
    "github.com/org",
    "github.com/org/repo/tree/main",
    "github.com/org/..",
    "localhost",
    "127.0.0.1",
    "example.com:8080",
    "user@example.com",
    "example.com/../etc",
    "example.com/a/./b",
    "example.com/a//b",
    "example.com/a b",
    "example.com/f%6fo", // percent-encoded paths would alias another tool
    "example.com/%2e%2e/x",
    "example.com/a?x=1",
    "example.com/a#frag",
    "example.com/" + "a/".repeat(9),
    "example.invalidtld", // not in the public suffix list
    "192.168.0.1/tool",
    "git.local",
    "",
  ])("rejects %s", (u) => {
    expect(proofFileUrl(u)).toBeNull();
  });
});

describe("checkProofFile", () => {
  it("passes when the identity is listed (several identities allowed)", async () => {
    const f = ok({ identities: ["x", ID] });
    expect(await checkProofFile("github.com/org/repo", ID, f, noTxt)).toEqual({ id: "proof", ok: true });
    expect(f).toHaveBeenCalledWith("https://raw.githubusercontent.com/org/repo/HEAD/.proof-of-tooling.json");
  });

  it("fails for unsupported URLs without fetching", async () => {
    const f = ok({});
    const r = await checkProofFile("localhost", ID, f, noTxt);
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("fails when the fetcher throws", async () => {
    const r = await checkProofFile("a.io", ID, async () => {
      throw new Error("boom");
    }, noTxt);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/^Could not fetch the proof file. Not found:/);
  });

  it("fails on non-200", async () => {
    expect((await checkProofFile("a.io", ID, ok("", 404), noTxt)).detail).toContain("404");
  });

  it("fails on oversized files", async () => {
    const r = await checkProofFile("a.io", ID, ok(" ".repeat(MAX_PROOF_BYTES + 1)), noTxt);
    expect(r.detail).toContain("too large");
  });

  it("fails on invalid JSON", async () => {
    expect((await checkProofFile("a.io", ID, ok("{nope"), noTxt)).detail).toContain("not valid JSON");
  });

  it.each([["null", "null"], ["no array", '{"identities":"x"}'], ["missing", "{}"]])("fails on bad shape (%s)", async (_n, body) => {
    expect((await checkProofFile("a.io", ID, ok(body), noTxt)).detail).toContain("identities");
  });

  it("fails when the identity is absent", async () => {
    expect((await checkProofFile("a.io", ID, ok({ identities: ["other"] }), noTxt)).detail).toContain("not listed");
  });
});

describe("registrableDomain (public suffix list)", () => {
  it.each([
    ["pumpkinspool.com", "pumpkinspool.com"],
    ["ag.validblocks.com/x", "validblocks.com"],
    ["a.b.example.co.uk", "example.co.uk"],
    ["foo.github.io/x", "foo.github.io"], // private suffix: every user is its own domain
    ["bar.github.io", "bar.github.io"],
    ["x.vercel.app", "x.vercel.app"],
  ])("%s -> %s", (u, d) => expect(registrableDomain(u)).toBe(d));

  it.each(["github.com/org/repo", "github.com", "localhost", "1.2.3.4", "example.invalidtld", "", "a b.com"])(
    "is null for repos and unsupported hosts: %s",
    (u) => expect(registrableDomain(u)).toBeNull(),
  );
});
