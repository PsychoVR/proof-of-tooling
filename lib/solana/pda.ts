import { createHash } from "node:crypto";
import bs58 from "bs58";

// Minimal program-derived-address derivation (SHA-256 + "is the point off the ed25519 curve").
// Kept dependency free on purpose: @solana/web3.js is far too heavy for this one function.

const P = (1n << 255n) - 19n;
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

/** True when the 32 bytes decompress to a valid ed25519 point. */
export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i]);
  y %= P;
  const y2 = (y * y) % P;
  const u = (y2 - 1n + P) % P;
  const v = (D * y2 + 1n) % P;
  if (v === 0n) return false;
  if (u === 0n) return true;
  const ratio = (u * modPow(v, P - 2n, P)) % P;
  // x^2 = u/v has a root iff it is a quadratic residue (Euler's criterion).
  return modPow(ratio, (P - 1n) / 2n, P) === 1n;
}

const PDA_MARKER = Buffer.from("ProgramDerivedAddress");

export function findProgramAddress(seeds: Uint8Array[], programId: string): { address: string; bump: number } {
  const program = bs58.decode(programId);
  if (program.length !== 32) throw new Error("invalid program id");
  for (const s of seeds) if (s.length > 32) throw new Error("seed too long");
  for (let bump = 255; bump >= 0; bump--) {
    const h = createHash("sha256");
    for (const s of seeds) h.update(s);
    h.update(Uint8Array.of(bump));
    h.update(program);
    h.update(PDA_MARKER);
    const digest = h.digest();
    if (!isOnCurve(digest)) return { address: bs58.encode(digest), bump };
  }
  throw new Error("no viable bump seed");
}

/** SPL stake pool withdraw authority: PDA([pool, "withdraw"], stakePoolProgram). */
export function splWithdrawAuthority(pool: string, program: string): string {
  return findProgramAddress([bs58.decode(pool), Buffer.from("withdraw")], program).address;
}
