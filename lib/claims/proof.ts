import { parse as parseHost } from "tldts";
import { parse as parseHtml, type DefaultTreeAdapterMap } from "parse5";
import type { ClaimCheckResult, ProofVia } from "@/lib/types";

export interface FetchedFile {
  status: number;
  body: string;
}
/**
 * Injected so tests need no network. The real fetcher must enforce a timeout,
 * a size cap, and refuse redirects or DNS results that point to private addresses.
 */
export type Fetcher = (url: string) => Promise<FetchedFile>;

/**
 * Injected DNS TXT lookup, same shape as dns.promises.resolveTxt: one entry per record, each a
 * list of the chunks that make up that record. It must reject on any failure.
 */
export type TxtResolver = (host: string) => Promise<string[][]>;

export const PROOF_FILE = ".proof-of-tooling.json";
export const WELL_KNOWN_PATH = "/.well-known/proof-of-tooling.json";
export const MAX_PROOF_BYTES = 64 * 1024;

const GITHUB_REPO = /^github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
// Optional path under the domain: plain segments only, no dot-segments, no query or fragment.
const WEB_PATH = /^(?:\/(?!\.{1,2}(?:\/|$))[A-Za-z0-9._~+-]{1,100}){0,8}$/;

/** Host and path of a web tool URL, or null when it is not a supported public domain. */
function splitWeb(toolUrl: string): { host: string; domain: string } | null {
  const slash = toolUrl.indexOf("/");
  const host = slash === -1 ? toolUrl : toolUrl.slice(0, slash);
  const path = slash === -1 ? "" : toolUrl.slice(slash);
  if (!DOMAIN.test(host) || host === "github.com" || !WEB_PATH.test(path)) return null;
  // The registrable domain comes from the public suffix list; IPs and unknown suffixes give null.
  // Bare public suffixes (vercel.app, github.io) have no registrable domain and are unsupported.
  const r = parseHost(host, { allowPrivateDomains: true, validateHostname: true });
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

/**
 * Account-level proof locations for a GitHub repo URL: the owner's `.github` repo and profile
 * repo (named like the owner). The owner always comes from the claimed URL, never from file
 * content. Empty for anything that is not a repo.
 */
export function accountProofUrls(toolUrl: string): string[] {
  const gh = GITHUB_REPO.exec(toolUrl);
  if (!gh) return [];
  const owner = gh[1];
  return [".github", owner].map((r) => `https://raw.githubusercontent.com/${owner}/${r}/HEAD/${PROOF_FILE}`);
}

type Outcome = { ok: true } | { ok: false; detail: string };
type RepoOutcome = { ok: true; via: "repo" | "account" } | { ok: false; detail: string };
const fail = (detail: string): Outcome => ({ ok: false, detail });

/** Fetches one proof JSON file and checks that it lists the identity. */
async function checkJsonFile(url: string, identity: string, fetcher: Fetcher): Promise<Outcome> {
  let file: FetchedFile;
  try {
    file = await fetcher(url);
  } catch {
    return fail("Could not fetch the proof file.");
  }
  if (file.status !== 200) return fail(`Proof file not found (HTTP ${file.status}).`);
  if (new TextEncoder().encode(file.body).length > MAX_PROOF_BYTES) return fail("Proof file is too large.");
  let json: unknown;
  try {
    json = JSON.parse(file.body);
  } catch {
    return fail("Proof file is not valid JSON.");
  }
  const identities = (json as { identities?: unknown } | null)?.identities;
  if (!Array.isArray(identities)) return fail('Proof file must contain {"identities": [...]}.');
  if (!identities.includes(identity)) return fail("Identity is not listed in the proof file.");
  return { ok: true };
}

const shown = (rawUrl: string) => rawUrl.replace("https://raw.githubusercontent.com/", "github.com/").replace("/HEAD/", "/");

/** Repo file first, then the owner's two account-level locations. */
async function checkRepo(toolUrl: string, repoUrl: string, identity: string, fetcher: Fetcher): Promise<RepoOutcome> {
  const first = await checkJsonFile(repoUrl, identity, fetcher);
  if (first.ok) return { ok: true, via: "repo" };
  // Skip a location that is the claimed repo itself (e.g. the claimed repo is `.github`).
  const others = accountProofUrls(toolUrl).filter((u) => u !== repoUrl);
  const results = await Promise.all(others.map((u) => checkJsonFile(u, identity, fetcher)));
  if (results.some((r) => r.ok)) return { ok: true, via: "account" };
  return { ok: false, detail: `${first.detail} Also tried ${others.map(shown).join(" and ")}.` };
}

/**
 * True when a `<meta name="proof-of-tooling" content="<identity>">` is a direct child of the
 * document's <head>. The HTML is parsed per spec (nothing executes); meta elements in the body,
 * in templates, noscript, comments, scripts or attribute values are never children of <head>.
 */
export function hasProofMeta(html: string, identity: string): boolean {
  type El = DefaultTreeAdapterMap["element"];
  const doc = parseHtml(html.slice(0, MAX_PROOF_BYTES), { sourceCodeLocationInfo: true });
  // The parser always builds html and head, even for empty input.
  const root = doc.childNodes.find((n) => n.nodeName === "html") as El;
  const head = root.childNodes.find((n) => n.nodeName === "head") as El;
  // The HTML spec re-inserts a <meta> that follows an explicit </head> into the head element,
  // so anything starting at or after the closing tag is rejected by source position.
  const headEnd = head.sourceCodeLocation?.endTag?.startOffset ?? Infinity;
  return head.childNodes.some((n) => {
    if (n.nodeName !== "meta") return false;
    const meta = n as El;
    if (meta.sourceCodeLocation!.startOffset >= headEnd) return false;
    const attr = (name: string) => meta.attrs.find((a) => a.name === name)?.value;
    return attr("name")?.trim().toLowerCase() === "proof-of-tooling" && attr("content")?.trim() === identity;
  });
}

async function checkTxt(host: string, identity: string, resolveTxt: TxtResolver): Promise<boolean> {
  let records: string[][];
  try {
    records = await resolveTxt(host); // the exact host only, never a parent domain
  } catch {
    return false;
  }
  const want = `proof-of-tooling=${identity}`;
  return records.some((chunks) => chunks.join("").trim() === want);
}

async function checkMeta(host: string, identity: string, fetcher: Fetcher): Promise<boolean> {
  try {
    const page = await fetcher(`https://${host}/`);
    return page.status === 200 && hasProofMeta(page.body, identity);
  } catch {
    return false;
  }
}

/**
 * Checks that the tool's owner published the identity. Repos: the repo's proof file, then the
 * owner's `.github` and profile repos. Webs, valid only for the exact host: the well-known file,
 * then (in parallel) a DNS TXT record on that host or a meta tag in the head of its home page.
 */
export async function checkProofFile(
  toolUrl: string,
  identity: string,
  fetcher: Fetcher,
  resolveTxt: TxtResolver,
): Promise<ClaimCheckResult> {
  const target = proofFileUrl(toolUrl);
  if (!target) return { id: "proof", ok: false, detail: "Unsupported tool URL." };

  if (target.kind === "repo") {
    const r = await checkRepo(toolUrl, target.url, identity, fetcher);
    return r.ok ? { id: "proof", ok: true, via: r.via } : { id: "proof", ok: false, detail: r.detail };
  }

  const wellKnown = await checkJsonFile(target.url, identity, fetcher);
  if (wellKnown.ok) return { id: "proof", ok: true, via: "well-known" };
  const host = new URL(target.url).hostname;
  const [txt, meta] = await Promise.all([checkTxt(host, identity, resolveTxt), checkMeta(host, identity, fetcher)]);
  if (txt || meta) return { id: "proof", ok: true, via: (txt ? "dns" : "meta") satisfies ProofVia };
  return {
    id: "proof",
    ok: false,
    detail:
      `${wellKnown.detail} Not found: ${target.url}, TXT record proof-of-tooling=${identity} on ${host}, ` +
      `<meta name="proof-of-tooling"> on https://${host}/`,
  };
}
