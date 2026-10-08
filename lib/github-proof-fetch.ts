import { getEnv } from "@/lib/env";
import type { Fetcher } from "@/lib/claims";

const API_CONTENTS = "https://api.github.com/repos/";
const TIMEOUT_MS = 5000;
const MAX_BYTES = 64 * 1024 + 1;

/** Reads at most `max` bytes of a response body; a longer body comes back one byte over the cap. */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    chunks.push(value);
    if (size >= max) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Reads proof files of GitHub repos through the contents API (authenticated with the same token as
 * the github job) instead of raw.githubusercontent.com, which caches for minutes and made a file
 * that was just created look missing. Only api.github.com/repos/... urls built by lib/claims reach
 * it; everything else goes to the fallback fetcher.
 */
export function createGithubAwareFetcher(
  fallback: Fetcher,
  opts: { fetchImpl?: typeof fetch; token?: () => string | undefined } = {},
): Fetcher {
  const f = opts.fetchImpl ?? fetch;
  const token = opts.token ?? (() => getEnv().GITHUB_TOKEN);
  return async (url) => {
    if (!url.startsWith(API_CONTENTS)) return fallback(url);
    const headers: Record<string, string> = { accept: "application/vnd.github.raw+json", "user-agent": "proof-of-tooling" };
    const t = token();
    if (t) headers.authorization = `Bearer ${t}`;
    const res = await f(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: res.status, body: res.status === 200 ? await readCapped(res, MAX_BYTES) : "" };
  };
}
