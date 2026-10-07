import {
  checkProofFile,
  evaluateRepoRules,
  evaluateWebRules,
  MAX_PENDING_PER_IDENTITY,
  parseClaimMessage,
  proofFileUrl,
  verifyClaimSignature,
  type Fetcher,
  type RepoMetadata,
} from "@/lib/claims";
import type { Category, Claim, ClaimCheckResult, ClaimRequest, ClaimResponse, Cluster } from "@/lib/types";

export interface ClaimHistory {
  existing: Claim | null;
  identityClaimsLast24h: number;
  otherClaimants: number;
  /** Other tools of this identity (active or pending) under the same registrable domain. */
  sameDomainClaims?: number;
  /** Claims of this identity currently waiting for manual review. */
  pendingClaims?: number;
}

/** Thrown by the storage layer when saving would exceed the pending limit (checked under a lock). */
export class PendingLimitError extends Error {
  constructor() {
    super("pending claim limit reached");
    this.name = "PendingLimitError";
  }
}

const pendingLimitDetail = `This identity already has ${MAX_PENDING_PER_IDENTITY} claims waiting for review. Wait for a decision before sending more.`;

/** Everything that touches the network or the database, injected so the flow is testable. */
export interface ClaimsDeps {
  now: () => Date;
  fetcher: Fetcher;
  /** Cluster of the vote account whose node identity matches, or null when unknown. */
  findValidatorCluster: (identity: string) => Promise<Cluster | null>;
  getRepoMetadata: (toolUrl: string) => Promise<RepoMetadata | null>;
  getHistory: (toolUrl: string, identity: string) => Promise<ClaimHistory>;
  saveClaim: (input: {
    toolUrl: string;
    identity: string;
    cluster: Cluster;
    message: string;
    signature: string;
    signedDate: string;
    action: "claim" | "unclaim";
    /** Store as `pending` (manual review) instead of `active`. */
    pending?: boolean;
    /** Category and name chosen in the claim form; used only when the tool is new. */
    category?: Category;
    toolName?: string;
  }) => Promise<Claim>;
}

/**
 * Runs the server verification pipeline in the SPEC order. With persist=true a fully
 * passing request is stored (idempotent). Stops at the first failing check.
 */
export async function processClaim(
  req: ClaimRequest,
  deps: ClaimsDeps,
  persist: boolean,
): Promise<ClaimResponse> {
  const parsed = parseClaimMessage(req.message);
  const sig = verifyClaimSignature({
    message: req.message,
    signature: req.signature,
    identity: parsed?.identity ?? "",
    now: deps.now(),
  });
  const checks: ClaimCheckResult[] = [...sig.checks];
  if (!sig.ok || !parsed) return { ok: false, checks };

  const cluster = await deps.findValidatorCluster(parsed.identity);
  if (!cluster) {
    checks.push({ id: "validator", ok: false, detail: "Identity is not a known validator node." });
    return { ok: false, checks };
  }
  checks.push({ id: "validator", ok: true });

  const history = await deps.getHistory(parsed.toolUrl, parsed.identity);
  const existing = history.existing;

  // An earlier decision or a newer signed message always wins over a replayed one. Public
  // signatures (registry.json) cannot be used to undo an unclaim or a moderation decision.
  if (existing) {
    if (existing.status === "rejected") {
      checks.push({ id: "status", ok: false, detail: "This claim was rejected by moderation." });
      return { ok: false, checks };
    }
    if (parsed.date < existing.signedDate) {
      checks.push({ id: "date", ok: false, detail: "A newer signed message already exists for this tool." });
      return { ok: false, checks };
    }
    if (parsed.action === "claim" && existing.status === "withdrawn" && parsed.date === existing.signedDate) {
      checks.push({ id: "date", ok: false, detail: "An unclaim signed the same day takes precedence; sign a new claim dated after it." });
      return { ok: false, checks };
    }
  }

  // Idempotent: repeating an existing claim returns it unchanged.
  if (parsed.action === "claim" && existing && existing.status === "active") {
    checks.push({ id: "proof", ok: true, detail: "Already claimed." });
    return { ok: true, claim: existing, checks };
  }
  if (parsed.action === "claim" && existing && existing.status === "pending") {
    checks.push({ id: "proof", ok: true, detail: "Already waiting for review." });
    return { ok: true, inReview: true, claim: existing, checks };
  }
  let inReview = false;

  // Withdrawing needs the signature only; the proof file may already be gone.
  if (parsed.action === "claim") {
    const proof = await checkProofFile(parsed.toolUrl, parsed.identity, deps.fetcher);
    checks.push(proof);
    if (!proof.ok) return { ok: false, checks };

    const ctx = {
      now: deps.now(),
      identityClaimsLast24h: history.identityClaimsLast24h,
      alreadyClaimedBySameIdentity: false,
      otherClaimants: history.otherClaimants,
    };
    const isRepo = proofFileUrl(parsed.toolUrl)?.kind === "repo";
    const checkId = isRepo ? "repo" : "rules";
    let outcome;
    if (isRepo) {
      const meta = await deps.getRepoMetadata(parsed.toolUrl);
      if (!meta) {
        checks.push({ id: "repo", ok: false, detail: "Repository metadata unavailable." });
        return { ok: false, checks };
      }
      outcome = evaluateRepoRules(meta, ctx);
    } else {
      outcome = evaluateWebRules({ ...ctx, sameDomainClaims: history.sameDomainClaims ?? 0 });
    }
    if (outcome.decision === "reject") {
      checks.push({ id: checkId, ok: false, detail: outcome.reasons.join(" ") });
      return { ok: false, checks };
    }
    inReview = outcome.decision === "review";
    if (inReview && (history.pendingClaims ?? 0) >= MAX_PENDING_PER_IDENTITY) {
      checks.push({ id: "rules", ok: false, detail: pendingLimitDetail });
      return { ok: false, checks };
    }
    checks.push({ id: checkId, ok: true, detail: inReview ? `Needs manual review: ${outcome.reasons.join(" ")}` : undefined });
  } else if (!existing) {
    checks.push({ id: "proof", ok: false, detail: "No claim to withdraw." });
    return { ok: false, checks };
  }

  if (!persist) return { ok: true, inReview, checks };
  let claim: Claim;
  try {
    claim = await deps.saveClaim({
      toolUrl: parsed.toolUrl,
      identity: parsed.identity,
      cluster,
      message: req.message,
      signature: req.signature,
      signedDate: parsed.date,
      action: parsed.action,
      pending: inReview,
      category: req.category,
      toolName: req.toolName,
    });
  } catch (err) {
    if (!(err instanceof PendingLimitError)) throw err;
    checks.push({ id: "rules", ok: false, detail: pendingLimitDetail });
    return { ok: false, checks };
  }
  return { ok: true, inReview, claim, checks };
}
