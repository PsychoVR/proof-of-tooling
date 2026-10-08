import { describe, expect, it, vi } from "vitest";
import { accountProofUrls, checkProofFile, hasProofMeta } from "@/lib/claims";
import { MAX_PROOF_BYTES } from "@/lib/claims/proof";

const ID = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const json = (ids: string[]) => ({ status: 200, body: JSON.stringify({ identities: ids }) });
const nf = { status: 404, body: "" };
const noTxt = async (): Promise<string[][]> => [];
const API = "https://api.github.com/repos";
const PROOF = ".proof-of-tooling.json";

/** Fetcher answering from a url -> response map; anything else is a 404. */
const router = (map: Record<string, { status: number; body: string }>) =>
  vi.fn(async (u: string) => map[u] ?? nf);

describe("repo proof (repo first, then the owner's account locations)", () => {
  const repo = `${API}/me/tool/contents/${PROOF}`;
  const dotGithub = `${API}/me/.github/contents/${PROOF}`;
  const profile = `${API}/me/me/contents/${PROOF}`;

  it("accepts the repo file and does not look further", async () => {
    const f = router({ [repo]: json([ID]) });
    expect(await checkProofFile("github.com/me/tool", ID, f, noTxt)).toEqual({ id: "proof", ok: true, via: "repo" });
    expect(f.mock.calls.map((c) => c[0])).toEqual([repo]);
  });

  it("accepts the owner's .github repo", async () => {
    const f = router({ [dotGithub]: json([ID]) });
    expect(await checkProofFile("github.com/me/tool", ID, f, noTxt)).toEqual({ id: "proof", ok: true, via: "account" });
  });

  it("accepts the owner's profile repo", async () => {
    const f = router({ [profile]: json([OTHER, ID]) });
    expect((await checkProofFile("github.com/me/tool", ID, f, noTxt)).ok).toBe(true);
  });

  it("falls back when the repo file exists but does not list the identity", async () => {
    const f = router({ [repo]: json([OTHER]), [profile]: json([ID]) });
    expect((await checkProofFile("github.com/me/tool", ID, f, noTxt)).via).toBe("account");
  });

  it("only ever asks for the claimed owner's URLs", async () => {
    const f = router({});
    const r = await checkProofFile("github.com/me/tool", ID, f, noTxt);
    expect(r.ok).toBe(false);
    expect(f.mock.calls.map((c) => c[0]).sort()).toEqual([dotGithub, profile, repo].sort());
    expect(r.detail).toContain("HTTP 404");
    expect(r.detail).toContain("If you just added the file, wait a couple of minutes and try again.");
    expect(r.detail).toContain("github.com/me/.github/.proof-of-tooling.json and github.com/me/me/.proof-of-tooling.json");
  });

  it("a file in another owner's account is never consulted", async () => {
    const f = router({ [`${API}/evil/evil/contents/${PROOF}`]: json([ID]), [`${API}/evil/.github/contents/${PROOF}`]: json([ID]) });
    expect((await checkProofFile("github.com/me/tool", ID, f, noTxt)).ok).toBe(false);
    expect(f.mock.calls.every((c) => c[0].startsWith(`${API}/me/`))).toBe(true);
  });

  it("does not fetch the same location twice when the repo is an account location", async () => {
    const both = [dotGithub, profile].sort();
    const f = router({});
    await checkProofFile("github.com/me/me", ID, f, noTxt);
    expect(f.mock.calls.map((c) => c[0]).sort()).toEqual(both);
    const g = router({});
    await checkProofFile("github.com/me/.github", ID, g, noTxt);
    expect(g.mock.calls.map((c) => c[0]).sort()).toEqual(both);
  });

  it("account locations that throw or are malformed fail cleanly", async () => {
    const f = vi.fn(async (u: string) => {
      if (u === dotGithub) throw new Error("boom");
      return u === profile ? { status: 200, body: "{nope" } : nf;
    });
    expect((await checkProofFile("github.com/me/tool", ID, f, noTxt)).ok).toBe(false);
  });

  it("accountProofUrls is empty for webs and incomplete repo URLs", () => {
    expect(accountProofUrls("example.com")).toEqual([]);
    expect(accountProofUrls("github.com/me")).toEqual([]);
    expect(accountProofUrls("github.com/me/tool")).toEqual([dotGithub, profile]);
  });
});

describe("web proof", () => {
  const wk = "https://tool.example.com/.well-known/proof-of-tooling.json";
  const home = "https://tool.example.com/";
  const page = (head: string) => ({ status: 200, body: `<!doctype html><html><head>${head}</head><body></body></html>` });
  const meta = (v = ID) => `<meta name="proof-of-tooling" content="${v}">`;

  it("accepts the well-known file without touching DNS or the home page", async () => {
    const f = router({ [wk]: json([ID]) });
    const dns = vi.fn(noTxt);
    expect((await checkProofFile("tool.example.com/x", ID, f, dns)).via).toBe("well-known");
    expect(dns).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("accepts a TXT record on the exact host (chunks joined, trimmed)", async () => {
    const dns = vi.fn(async (_h: string) => [["v=spf1 -all"], ["proof-of-tooling=" + ID.slice(0, 10), ID.slice(10) + " "]]);
    expect((await checkProofFile("tool.example.com/x", ID, router({}), dns)).via).toBe("dns");
    expect(dns.mock.calls).toEqual([["tool.example.com"]]);
  });

  it("queries only the exact host, never a parent domain", async () => {
    const dns = vi.fn(async (h: string) => (h === "example.com" ? [[`proof-of-tooling=${ID}`]] : []));
    const r = await checkProofFile("tool.example.com", ID, router({}), dns);
    expect(r.ok).toBe(false);
    expect(dns.mock.calls).toEqual([["tool.example.com"]]);
  });

  it("rejects a TXT record for another identity or with extra text", async () => {
    for (const rec of [`proof-of-tooling=${OTHER}`, `proof-of-tooling=${ID} extra`, `x proof-of-tooling=${ID}`, ID]) {
      expect((await checkProofFile("tool.example.com", ID, router({}), async () => [[rec]])).ok).toBe(false);
    }
  });

  it("treats resolver errors as a failed method", async () => {
    const r = await checkProofFile("tool.example.com", ID, router({}), async () => {
      throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
    });
    expect(r.ok).toBe(false);
  });

  it("accepts a meta tag in the head of the home page", async () => {
    const f = router({ [home]: page(`<title>x</title>${meta()}`) });
    expect((await checkProofFile("tool.example.com/x", ID, f, noTxt)).via).toBe("meta");
    expect(f).toHaveBeenCalledWith(home);
  });

  it("failure detail lists everything tried", async () => {
    const r = await checkProofFile("tool.example.com", ID, router({}), noTxt);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain(`Not found: ${wk}`);
    expect(r.detail).toContain(`TXT record proof-of-tooling=${ID} on tool.example.com`);
    expect(r.detail).toContain('<meta name="proof-of-tooling"> on https://tool.example.com/');
  });

  it("a failing home page (error, non-200) is a failed method", async () => {
    const boom = vi.fn(async (u: string) => {
      if (u === home) throw new Error("blocked");
      return nf;
    });
    expect((await checkProofFile("tool.example.com", ID, boom, noTxt)).ok).toBe(false);
    const f = router({ [home]: { status: 500, body: `<head>${meta()}</head>` } });
    expect((await checkProofFile("tool.example.com", ID, f, noTxt)).ok).toBe(false);
  });

  it("rejects bare public suffixes but accepts their registrable subdomains", async () => {
    for (const u of ["vercel.app", "github.io", "netlify.app", "co.uk"]) {
      const f = router({});
      const dns = vi.fn(noTxt);
      expect(await checkProofFile(u, ID, f, dns)).toMatchObject({ ok: false, detail: "Unsupported tool URL." });
      expect(f).not.toHaveBeenCalled();
      expect(dns).not.toHaveBeenCalled();
    }
    const dns = vi.fn(async (_h: string) => [[`proof-of-tooling=${ID}`]]);
    expect((await checkProofFile("foo.vercel.app", ID, router({}), dns)).ok).toBe(true);
    expect(dns.mock.calls).toEqual([["foo.vercel.app"]]);
  });
});

describe("hasProofMeta", () => {
  const m = `<meta name="proof-of-tooling" content="${ID}">`;
  const doc = (head: string, body = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

  it("accepts spec-valid variants", () => {
    expect(hasProofMeta(doc(m), ID)).toBe(true);
    expect(hasProofMeta(doc(`<META NAME="Proof-Of-Tooling" CONTENT=" ${ID} ">`), ID)).toBe(true);
    expect(hasProofMeta(doc(`<meta content='${ID}' name=proof-of-tooling />`), ID)).toBe(true);
    expect(hasProofMeta(`<title>t</title>${m}<p>hi`, ID)).toBe(true); // implied html and head
    expect(hasProofMeta(doc(`<meta name="proof-of-tooling" content="${OTHER}">${m}`), ID)).toBe(true); // any match suffices
  });

  it.each([
    ["in the body", doc("", m)],
    ["inside a template in head", doc(`<template>${m}</template>`)],
    ["inside a template in body", doc("", `<template>${m}</template>`)],
    ["inside noscript in head", doc(`<noscript>${m}</noscript>`)],
    ["inside a comment", doc(`<!-- ${m} -->`)],
    ["inside a script string", doc(`<script>document.write('${m}')</script>`)],
    ["inside a title", doc(`<title>${m}</title>`)],
    ["inside an attribute value", doc(`<meta name="description" content='${m.replace(/"/g, "&quot;")}'>`)],
    ["after </head>", `<html><head><title>t</title></head>${m}<body></body></html>`],
    ["after </head> with whitespace", `<html><head></head>\n  ${m}\n<body></body></html>`],
    ["in a foreign element", doc("", `<svg>${m}</svg>`)],
    ["with another identity", doc(`<meta name="proof-of-tooling" content="${OTHER}">`)],
    ["with extra text in content", doc(`<meta name="proof-of-tooling" content="${ID} x">`)],
    ["with another name", doc(`<meta name="proof" content="${ID}">`)],
    ["without content", doc(`<meta name="proof-of-tooling">`)],
    ["without name", doc(`<meta content="${ID}">`)],
    ["with property instead of name", doc(`<meta property="proof-of-tooling" content="${ID}">`)],
    ["in a bare body fragment", `<div>${m}</div>`],
    ["in an empty document", ""],
  ])("rejects a meta %s", (_n, html) => {
    expect(hasProofMeta(html, ID)).toBe(false);
  });

  it("only reads the first 64KB (an oversize page cannot hide or force a match)", () => {
    expect(hasProofMeta(doc(m + "x".repeat(MAX_PROOF_BYTES * 2)), ID)).toBe(true);
    expect(hasProofMeta(doc("<!--" + "x".repeat(MAX_PROOF_BYTES) + "-->" + m), ID)).toBe(false);
  });
});
