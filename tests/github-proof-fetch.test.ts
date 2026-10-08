import { describe, expect, it, vi } from "vitest";
import { createGithubAwareFetcher } from "@/lib/github-proof-fetch";

const URL_ = "https://api.github.com/repos/me/tool/contents/.proof-of-tooling.json";
const fallback = vi.fn(async () => ({ status: 200, body: "fallback" }));

describe("createGithubAwareFetcher", () => {
  it("reads contents api urls as raw text with the token", async () => {
    const f = vi.fn(async () => new Response('{"identities":[]}', { status: 200 }));
    const fetcher = createGithubAwareFetcher(fallback, { fetchImpl: f as never, token: () => "tok" });
    expect(await fetcher(URL_)).toEqual({ status: 200, body: '{"identities":[]}' });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ accept: "application/vnd.github.raw+json", authorization: "Bearer tok" });
  });

  it("works without a token and returns an empty body for errors", async () => {
    const f = vi.fn(async () => new Response("nope", { status: 404 }));
    const fetcher = createGithubAwareFetcher(fallback, { fetchImpl: f as never, token: () => undefined });
    expect(await fetcher(URL_)).toEqual({ status: 404, body: "" });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).not.toHaveProperty("authorization");
  });

  it("caps oversized bodies and tolerates a missing body", async () => {
    const big = vi.fn(async () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 20; i++) c.enqueue(new Uint8Array(10_000)); c.close(); } }), { status: 200 }));
    const r = await createGithubAwareFetcher(fallback, { fetchImpl: big as never, token: () => undefined })(URL_);
    expect(r.body.length).toBeGreaterThan(64 * 1024);
    expect(r.body.length).toBeLessThan(200_000);
    const none = vi.fn(async () => ({ status: 200, body: null }) as unknown as Response);
    expect((await createGithubAwareFetcher(fallback, { fetchImpl: none as never, token: () => undefined })(URL_)).body).toBe("");
  });

  it("sends every other url to the fallback", async () => {
    const f = vi.fn();
    const fetcher = createGithubAwareFetcher(fallback, { fetchImpl: f as never });
    expect(await fetcher("https://example.com/.well-known/proof-of-tooling.json")).toEqual({ status: 200, body: "fallback" });
    expect(f).not.toHaveBeenCalled();
  });
});
