import { NotImplemented } from "@/lib/errors";
import type { ClaimCheckResult, ParsedClaimMessage } from "@/lib/types";

/** Parses a v1 claim line. Returns null when the format is invalid. */
export function parseClaimMessage(_message: string): ParsedClaimMessage | null {
  throw new NotImplemented("parseClaimMessage");
}

/** Wraps the message in the Solana off-chain v0 envelope (restricted ASCII). */
export function serializeOffchainV0(_message: string): Uint8Array {
  throw new NotImplemented("serializeOffchainV0");
}

/** Verifies an Ed25519 signature (base58) over the off-chain v0 serialization. */
export function verifyClaimSignature(
  _message: string,
  _signature: string,
  _identity: string,
): boolean {
  throw new NotImplemented("verifyClaimSignature");
}

/** Fetches the proof file of a tool and checks that it lists the identity. */
export async function checkProofFile(
  _toolUrl: string,
  _identity: string,
): Promise<ClaimCheckResult> {
  throw new NotImplemented("checkProofFile");
}
