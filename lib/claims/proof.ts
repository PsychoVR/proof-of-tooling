import { parse } from "tldts";
import type { ClaimCheckResult } from "@/lib/types";

export interface FetchedFile {
  status: number;
  body: string;
}
/**
 * Injected so tests need no network. The real fetcher must enforce a timeout,
 * a size cap, and refuse redirects or DNS results that point to private addresses.
 */
export type Fetcher = (url: string) => Promise<FetchedFile>;

export const PROOF_FILE = ".proof-of-tooling.json";
export const WELL_KNOWN_PATH = "/.well-known/proof-of-tooling.json";
export const MAX_PROOF_BYTES = 64 * 1024;

const GITHUB_REPO = /^github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
// Optional path under the domain: plain segments only, no dot-segments, no query or fragment.
const WEB_PATH = /^(?:\/(?!\.{1,2}(?:\/|$))[A-Za-z0-9._~%+-]{1,100}){0,8}$/;

/** Host and path of a web tool URL, or null when it is not a supported public domain. */
function splitWeb(toolUrl: string): { host: string; domain: string } | null {
  const slash = toolUrl.indexOf("/");
  const host = slash === -1 ? toolUrl : toolUrl.slice(0, slash);
  const path = slash === -1 ? "" : toolUrl.slice(slash);
  if (!DOMAIN.test(host) || host === "github.com" || !WEB_PATH.test(path)) return null;
  // The registrable domain comes from the public suffix list; IPs and unknown suffixes give null.
  const r = parse(host, { allowPrivateDomains: true, validateHostname: true });
  return r.domain && (r.isIcann || r.isPrivate) ? { host, domain: r.domain } : null;
}

/**
 * Registrable domain (eTLD+1, with private suffixes such as github.io counted as suffixes) of a
 * web tool URL, or null for repos and unsupported URLs. Used to count tools per domain.
 */
export function registrableDomain(toolUrl: string): string | null {
  return GITHUB_REPO.test(toolUrl) ? null : (splitWeb(toolUrl)?.domain ?? null);
}

/**
 * Maps a normalized tool URL to its proof file location, or null when unsupported.
 * A web tool is a public domain with an optional path; the proof file at the root of that
 * domain's /.well-known/ covers every URL under it.
 */
export function proofFileUrl(toolUrl: string): { kind: "repo" | "web"; url: string } | null {
  const gh = GITHUB_REPO.exec(toolUrl);
  if (gh) {
    if (gh[2] === "." || gh[2] === "..") return null;
    // HEAD resolves to the default branch.
    return { kind: "repo", url: `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/HEAD/${PROOF_FILE}` };
  }
  const web = splitWeb(toolUrl);
  return web ? { kind: "web", url: `https://${web.host}${WELL_KNOWN_PATH}` } : null;
}

export async function checkProofFile(
  toolUrl: string,
  identity: string,
  fetcher: Fetcher,
): Promise<ClaimCheckResult> {
  const target = proofFileUrl(toolUrl);
  if (!target) return { id: "proof", ok: false, detail: "Unsupported tool URL." };

  let file: FetchedFile;
  try {
    file = await fetcher(target.url);
  } catch {
    return { id: "proof", ok: false, detail: "Could not fetch the proof file." };
  }
  if (file.status !== 200) {
    return { id: "proof", ok: false, detail: `Proof file not found (HTTP ${file.status}).` };
  }
  if (new TextEncoder().encode(file.body).length > MAX_PROOF_BYTES) {
    return { id: "proof", ok: false, detail: "Proof file is too large." };
  }
  let json: unknown;
  try {
    json = JSON.parse(file.body);
  } catch {
    return { id: "proof", ok: false, detail: "Proof file is not valid JSON." };
  }
  const identities = (json as { identities?: unknown } | null)?.identities;
  if (!Array.isArray(identities)) {
    return { id: "proof", ok: false, detail: 'Proof file must contain {"identities": [...]}.' };
  }
  if (!identities.includes(identity)) {
    return { id: "proof", ok: false, detail: "Identity is not listed in the proof file." };
  }
  return { id: "proof", ok: true };
}
