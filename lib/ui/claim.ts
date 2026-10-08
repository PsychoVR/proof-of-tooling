// Claim wizard helpers: message building, input validation and the check client.
import { MIN_FORK_OWN_COMMITS } from "@/lib/claims/rules";
import { isValidDate, normalizeToolUrl, signatureDateStatus, utcToday } from "@/lib/claims/message";
import { SITE_URL, TWITTER_HANDLE } from "@/lib/seo";
import { CATEGORIES, type Category, type ClaimCheckResponse, type ClaimCheckResult, type ClaimRequest, type ClaimResponse } from "@/lib/types";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decodes base58 and returns the byte length, or null when the input is not base58. */
export function base58Length(s: string): number | null {
  if (!s) return null;
  const bytes: number[] = [];
  let zeros = 0;
  let leading = true;
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    if (leading && ch === "1") zeros++;
    else leading = false;
    let carry = v;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 255;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  return bytes.length + zeros;
}

/** Only characters that cannot break out of a double-quoted shell argument. */
const SAFE_TOOL_URL = /^[A-Za-z0-9._~:/%@+-]+$/;

export { normalizeToolUrl };

export function validateToolUrl(input: string): string | null {
  const n = normalizeToolUrl(input);
  if (!n) return "Enter the repo or site URL.";
  if (!SAFE_TOOL_URL.test(n) || !n.includes(".")) return "Use a plain URL such as github.com/you/your-tool.";
  return null;
}

export function validateIdentity(input: string): string | null {
  const s = input.trim();
  if (!s) return "Enter your validator identity pubkey.";
  if (s.length < 32 || s.length > 44 || base58Length(s) !== 32) return "That is not a valid base58 public key.";
  return null;
}

export function buildClaimMessage(toolUrl: string, identity: string, date: string): string {
  return `proof-of-tooling v1 | claim | ${normalizeToolUrl(toolUrl)} | ${identity.trim()} | ${date}`;
}

const GH_REPO = /^github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/;
export const PROOF_FILE_NAME = ".proof-of-tooling.json";

/** Contents of the proof file for an identity, pretty-printed for copying. */
export function proofJson(identity: string): string {
  return JSON.stringify({ identities: [identity.trim()] }, null, 2) + "\n";
}

/** Value of the DNS TXT record that proves ownership of a host. */
export function dnsTxtValue(identity: string): string {
  return `proof-of-tooling=${identity.trim()}`;
}

/** Meta tag that proves ownership when placed inside the <head> of the home page. */
export function metaTag(identity: string): string {
  return `<meta name="proof-of-tooling" content="${identity.trim()}">`;
}

export type WebMethod = "file" | "dns" | "meta";
export const WEB_METHODS: { id: WebMethod; label: string }[] = [
  { id: "file", label: "File" },
  { id: "dns", label: "DNS TXT" },
  { id: "meta", label: "Meta tag" },
];

/** Index of the tab to focus after a key press in a tablist, or null for keys that do nothing. */
export function nextTabIndex(current: number, key: string, count: number): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export type ProofTarget =
  | { kind: "repo"; owner: string; repo: string; where: string; accountRepos: [string, string] }
  | { kind: "web"; host: string; where: string };

/** Where the proof file must live for a canonical tool URL (what the server will fetch). */
export function proofTarget(toolUrl: string): ProofTarget | null {
  const n = normalizeToolUrl(toolUrl);
  const gh = GH_REPO.exec(n);
  if (gh) {
    return {
      kind: "repo",
      owner: gh[1],
      repo: gh[2],
      where: `${n}/${PROOF_FILE_NAME}` + " (root of the default branch)",
      accountRepos: [`github.com/${gh[1]}/.github`, `github.com/${gh[1]}/${gh[1]}`],
    };
  }
  const host = n.split("/")[0];
  if (!host.includes(".") || host === "github.com") return null;
  return { kind: "web", host, where: `https://${host}/.well-known/proof-of-tooling.json` };
}

/** GitHub "new file" page with name and contents already filled in. */
export function githubNewFileUrl(owner: string, repo: string, branch: string, identity: string): string {
  const q = new URLSearchParams({ filename: PROOF_FILE_NAME, value: proofJson(identity) });
  return `https://github.com/${owner}/${repo}/new/${encodeURIComponent(branch)}?${q.toString().replace(/\+/g, "%20")}`;
}

/** Turns a failed proof check into a message that says which file is missing and where. */
export function proofHint(toolUrl: string, identity = "<identity>"): string | null {
  const t = proofTarget(toolUrl);
  if (!t) return null;
  if (t.kind === "repo") {
    const [a, b] = t.accountRepos;
    return `Expected file: ${t.where}, or the same file in ${a} or ${b} (covers all your repos; claims proved this way are reviewed manually).`;
  }
  return (
    `Expected one of: ${t.where}; a DNS TXT record ${dnsTxtValue(identity)} on ${t.host}; ` +
    `or ${metaTag(identity)} in the <head> of https://${t.host}/.`
  );
}

export function signCommand(message: string): string {
  return `solana sign-offchain-message -k ~/validator-keypair.json "${message}"`;
}

/** Same message signed with a Ledger that holds the identity key. */
export function signCommandLedger(message: string): string {
  return `solana sign-offchain-message -k usb://ledger "${message}"`;
}

export type SignMethod = "file" | "ledger" | "remote";
export const SIGN_METHODS: { id: SignMethod; label: string }[] = [
  { id: "file", label: "Key file" },
  { id: "ledger", label: "Ledger" },
  { id: "remote", label: "Another machine" },
];

/** Typed stand-in for POST /api/v1/claims/check. Runs format checks only; the rest is marked simulated. */
export function mockCheckClaim(req: ClaimRequest): ClaimCheckResponse {
  const parts = req.message.split(" | ");
  const formatOk = parts.length === 5 && parts[0] === "proof-of-tooling v1" && parts[1] === "claim";
  const dateOk = formatOk && /^\d{4}-\d{2}-\d{2}$/.test(parts[4]);
  const encodingOk = base58Length(req.signature.trim()) === 64;
  const checks: ClaimCheckResult[] = [
    { id: "format", ok: formatOk },
    { id: "date", ok: dateOk },
    { id: "encoding", ok: encodingOk, detail: encodingOk ? undefined : "The signature must be 64 bytes of base58." },
    { id: "signature", ok: encodingOk, detail: "Simulated: server verification is not connected yet." },
    { id: "validator", ok: encodingOk, detail: "Simulated." },
    { id: "proof", ok: encodingOk, detail: "Simulated." },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

/** Records a verified claim (POST /api/v1/claims). Returns null when the service is unreachable. */
export async function registerClaim(req: ClaimRequest): Promise<ClaimResponse | null> {
  try {
    const res = await fetch("/api/v1/claims", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    const body = (await res.json()) as ClaimResponse;
    return Array.isArray(body?.checks) ? body : null;
  } catch {
    return null;
  }
}

/** Calls the real endpoint and falls back to the mock when it does not exist yet (404 or network error). */
export async function checkClaim(
  req: ClaimRequest,
): Promise<{ result: ClaimCheckResponse; simulated: boolean }> {
  try {
    const res = await fetch("/api/v1/claims/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (res.status !== 404) {
      const body = (await res.json()) as ClaimCheckResponse;
      if (Array.isArray(body?.checks)) return { result: body, simulated: false };
    }
  } catch {
    // fall through to the mock
  }
  return { result: mockCheckClaim(req), simulated: true };
}

export const CHECK_LABELS: Record<ClaimCheckResult["id"], string> = {
  format: "Message format is valid",
  date: "Claim date is valid and recent",
  encoding: "Signature is well formed",
  signature: "Signature matches the message and identity",
  status: "Claim is not blocked by an earlier decision",
  validator: "Identity has a live vote account",
  proof: "Ownership proof lists this identity",
  repo: "Repo is public and original",
  rules: "Passes the anti-abuse rules",
};

/** X intent link with a ready-made post that mentions the account and links to the tool page. */
export function shareOnXUrl(toolName: string, pageUrl: string): string {
  const text = `I just claimed ${toolName} on Proof of Tooling, a verified directory of tools built by Solana validators.\n\n${pageUrl}\n\n${TWITTER_HANDLE}`;
  return `https://x.com/intent/post?${new URLSearchParams({ text }).toString().replace(/\+/g, "%20")}`;
}

/** Public URL of a tool page on the site. */
export const toolPageUrl = (slug: string) => `${SITE_URL}/t/${slug}`;

export interface ClaimPrefill {
  url: string;
  name: string;
  /** Empty until the visitor (or the link) picks one. */
  category: Category | "";
}

/** Link to the claim form with the tool already filled in (used by "Claim this"). */
export function claimLink(tool: { url: string; name: string; category: Category }): string {
  return `/claim?${new URLSearchParams({ url: tool.url, name: tool.name, category: tool.category }).toString()}`;
}

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Reads /claim?url=&name=&category= defensively: anything invalid is dropped, never an error. */
export function parseClaimPrefill(params: Record<string, Param>): ClaimPrefill {
  const rawUrl = first(params.url).trim().slice(0, 300);
  const category = first(params.category);
  return {
    url: rawUrl && !validateToolUrl(rawUrl) ? normalizeToolUrl(rawUrl) : "",
    name: first(params.name).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80),
    category: (CATEGORIES as readonly string[]).includes(category) ? (category as Category) : "",
  };
}

/** sessionStorage key of the claim wizard: reloading or going back keeps what was typed. */
export const WIZARD_STORAGE_KEY = "pot-claim-wizard-v1";

export interface WizardState {
  step: 0 | 1 | 2;
  name: string;
  url: string;
  category: Category | "";
  identity: string;
  /** Date (UTC) of the message being signed. */
  date: string;
  signature: string;
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Reads the stored wizard state defensively: anything malformed is dropped (null), never an error. */
export function parseWizardState(raw: string | null): WizardState | null {
  if (!raw) return null;
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof j !== "object" || j === null) return null;
  const o = j as Record<string, unknown>;
  const date = clip(o.date, 10);
  if (!isValidDate(date)) return null;
  const category = (CATEGORIES as readonly string[]).includes(o.category as string) ? (o.category as Category) : "";
  const step = o.step === 1 || o.step === 2 ? o.step : 0;
  return { step, name: clip(o.name, 80), url: clip(o.url, 300), category, identity: clip(o.identity, 60), date, signature: clip(o.signature, 200) };
}

export function serializeWizardState(s: WizardState): string {
  return JSON.stringify(s);
}

/**
 * The message date has to be one the server still accepts. When it is not (the wizard sat open or
 * was restored days later), the date becomes today, the old signature no longer matches and the
 * visitor goes back to the signing step.
 */
export function reconcileWizardDate(s: WizardState, now: Date): { state: WizardState; regenerated: boolean } {
  if (signatureDateStatus(s.date, now) === "ok") return { state: s, regenerated: false };
  return { state: { ...s, date: utcToday(now), signature: "", step: s.step === 2 ? 1 : s.step }, regenerated: true };
}

export const DATE_REGENERATED_NOTICE =
  "The date of your claim message is no longer valid, so it was regenerated with today's date (UTC). Sign the new message again and paste the new signature.";

/** Hint under the url field; the fork rule is read from the rules so the text cannot drift from them. */
export const URL_HINT = `Public repo or live site. Forks need at least ${MIN_FORK_OWN_COMMITS} commits of their own; fewer go to manual review.`;

/** Most likely cause and fix for a failed signature, format or date check; null for the other steps. */
export function checkAdvice(id: ClaimCheckResult["id"], today: string): string | null {
  switch (id) {
    case "format":
      return "Most likely the message was edited or retyped by hand. Copy it exactly from step 2, including the spaces around each |, instead of rewriting it.";
    case "date":
      return `The date in the message must be today's date in UTC (today is ${today}) or within the last 7 days. If it is older, go back to step 2 to get a message dated today and sign that one.`;
    case "signature":
      return "Most likely one of these: the message was changed after it was copied (copy the whole command from step 2 untouched); the shell altered the quotes (in PowerShell wrap the message in single quotes, or escape each double quote); or the key is not your validator identity keypair (not the vote account or withdrawer key). Check that solana-keygen pubkey on your key file prints your identity.";
    default:
      return null;
  }
}
