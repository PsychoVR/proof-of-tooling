import bs58 from "bs58";
import nacl from "tweetnacl";
import type { ClaimCheckResult } from "@/lib/types";
import { parseClaimMessage } from "./message";
import { OFFCHAIN_MAX_MESSAGE_BYTES, serializeOffchainV0 } from "./offchain";

export const MAX_SIGNATURE_AGE_DAYS = 7;
const MAX_FUTURE_DAYS = 1;
const DAY_MS = 86_400_000;

export interface VerifyInput {
  message: string;
  signature: string;
  identity: string;
  /** Injected clock, defaults to the current time. */
  now?: Date;
}

export interface VerifyResult {
  ok: boolean;
  /** Checks in order: format, date, encoding, signature. Verification stops at the first failure. */
  checks: ClaimCheckResult[];
}

function decodeFixed(s: string, length: number): Uint8Array | null {
  try {
    const bytes = bs58.decode(s);
    return bytes.length === length ? bytes : null;
  } catch {
    return null;
  }
}

/** Whole UTC calendar days between the signed date and today. */
function daysSince(date: string, now: Date): number {
  const signed = Date.parse(`${date}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - signed) / DAY_MS);
}

export function verifyClaimSignature(input: VerifyInput): VerifyResult {
  const checks: ClaimCheckResult[] = [];
  const fail = (id: ClaimCheckResult["id"], detail: string): VerifyResult => {
    checks.push({ id, ok: false, detail });
    return { ok: false, checks };
  };
  const pass = (id: ClaimCheckResult["id"]) => checks.push({ id, ok: true });

  const parsed = parseClaimMessage(input.message);
  if (!parsed) return fail("format", "Message is not a valid proof-of-tooling v1 line in printable ASCII.");
  if (parsed.identity !== input.identity) {
    return fail("format", "Identity in the message does not match the identity provided.");
  }
  if (input.message.length > OFFCHAIN_MAX_MESSAGE_BYTES) return fail("format", "Message is too long.");
  pass("format");

  const age = daysSince(parsed.date, input.now ?? new Date());
  if (age > MAX_SIGNATURE_AGE_DAYS) {
    return fail("date", `Signed ${age} days ago; the limit is ${MAX_SIGNATURE_AGE_DAYS}.`);
  }
  if (age < -MAX_FUTURE_DAYS) return fail("date", "Signature date is in the future.");
  pass("date");

  const pubkey = decodeFixed(input.identity, 32);
  if (!pubkey) return fail("encoding", "Identity must decode from base58 to 32 bytes.");
  const sig = decodeFixed(input.signature, 64);
  if (!sig) return fail("encoding", "Signature must decode from base58 to 64 bytes.");
  pass("encoding");

  // Only the off-chain v0 envelope is accepted. Raw message bytes are never verified.
  if (!nacl.sign.detached.verify(serializeOffchainV0(input.message), sig, pubkey)) {
    return fail("signature", "Signature is not valid over the off-chain v0 serialization of the message.");
  }
  pass("signature");
  return { ok: true, checks };
}
