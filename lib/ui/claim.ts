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
  proof: "Proof file lists this identity",
  repo: "Repo is public and original",
  rules: "Passes the anti-abuse rules",
};
