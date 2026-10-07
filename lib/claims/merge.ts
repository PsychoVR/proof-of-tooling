import type { ClaimStatus } from "@/lib/types";

export interface StoredClaimState {
  status: ClaimStatus;
  /** YYYY-MM-DD of the signed message currently stored. */
  signedDate: string;
}

export interface IncomingClaimState {
  status: ClaimStatus;
  signedDate: string;
}

/**
 * Decides whether a verified incoming claim replaces the stored one for the same (tool, identity).
 * Pure so it can be tested exhaustively; the storage layer calls it while holding a row lock.
 *
 * - nothing stored: apply
 * - a rejected claim stays rejected (only a moderation decision can change it)
 * - a message dated before the stored one never replaces it
 * - on the same day, a withdrawal beats any later claim
 * - otherwise apply, including a claim dated after an unclaim
 */
export function mergeClaim(existing: StoredClaimState | null, incoming: IncomingClaimState): "apply" | "keep" {
  if (!existing) return "apply";
  if (existing.status === "rejected") return "keep";
  if (incoming.signedDate < existing.signedDate) return "keep";
  if (incoming.signedDate === existing.signedDate && existing.status === "withdrawn" && incoming.status !== "withdrawn") {
    return "keep";
  }
  return "apply";
}
