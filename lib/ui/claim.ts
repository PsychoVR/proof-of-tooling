// Claim wizard helpers: message building, input validation and the check client.
import { normalizeToolUrl } from "@/lib/claims/message";
import type { ClaimCheckResponse, ClaimCheckResult, ClaimRequest, ClaimResponse } from "@/lib/types";

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
    return `Expected file: ${t.where}, or the same file in ${a} or ${b} (covers all your repos).`;
  }
  return (
    `Expected one of: ${t.where}; a DNS TXT record ${dnsTxtValue(identity)} on ${t.host}; ` +
    `or ${metaTag(identity)} in the <head> of https://${t.host}/.`
  );
}

export function signCommand(message: string): string {
  return `solana sign-offchain-message -k ~/validator-keypair.json "${message}"`;
}

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
