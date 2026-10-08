import { describe, expect, it } from "vitest";
import { claimLink, parseClaimPrefill, shareOnXUrl } from "@/lib/ui/claim";

describe("claim prefill", () => {
  it("round-trips a tool through the link", () => {
    const tool = { url: "github.com/a/b", name: "My Tool & Co", category: "Meta" as const };
    const q = new URL(claimLink(tool), "https://x.test").searchParams;
    expect(parseClaimPrefill(Object.fromEntries(q))).toEqual(tool);
  });

  it("normalizes the url, defaults the category and drops unsafe values", () => {
    expect(parseClaimPrefill({ url: "https://www.github.com/a/b/", category: "Nope" })).toEqual({
      url: "github.com/a/b",
      name: "",
      category: "",
    });
    expect(parseClaimPrefill({ url: 'a.com/x"; rm' }).url).toBe("");
    expect(parseClaimPrefill({ url: ["github.com/a/b", "other.com"] }).url).toBe("github.com/a/b");
    expect(parseClaimPrefill({ name: "a\u0000b" }).name).toBe("a b");
    expect(parseClaimPrefill({ name: "x".repeat(200) }).name).toHaveLength(80);
  });
});

describe("shareOnXUrl", () => {
  it("mentions the account and carries the tool page url", () => {
    const u = new URL(shareOnXUrl("My Tool", "https://tooling.sunshinevr.io/t/my-tool"));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    const text = u.searchParams.get("text")!;
    expect(text).toContain("@proofoftooling");
    expect(text).toContain("https://tooling.sunshinevr.io/t/my-tool");
    expect(u.search).not.toContain("+");
  });
});
