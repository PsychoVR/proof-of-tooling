import {
  checkProofFile,
  evaluateRepoRules,
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
}

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

  // Idempotent: repeating an existing claim returns it unchanged.
  if (parsed.action === "claim" && history.existing && history.existing.status === "active") {
    checks.push({ id: "proof", ok: true, detail: "Already claimed." });
    return { ok: true, claim: history.existing, checks };
  }

  // Withdrawing needs the signature only; the proof file may already be gone.
  if (parsed.action === "claim") {
    const proof = await checkProofFile(parsed.toolUrl, parsed.identity, deps.fetcher);
    checks.push(proof);
    if (!proof.ok) return { ok: false, checks };

    if (proofFileUrl(parsed.toolUrl)?.kind === "repo") {
      const meta = await deps.getRepoMetadata(parsed.toolUrl);
      if (!meta) {
        checks.push({ id: "repo", ok: false, detail: "Repository metadata unavailable." });
        return { ok: false, checks };
      }
      const outcome = evaluateRepoRules(meta, {
        now: deps.now(),
        identityClaimsLast24h: history.identityClaimsLast24h,
        alreadyClaimedBySameIdentity: false,
        otherClaimants: history.otherClaimants,
      });
      if (outcome.decision !== "accept") {
        const prefix = outcome.decision === "review" ? "Queued for manual review: " : "";
        checks.push({ id: "repo", ok: false, detail: prefix + outcome.reasons.join(" ") });
        return { ok: false, checks };
      }
      checks.push({ id: "repo", ok: true });
    }
  } else if (!history.existing) {
    checks.push({ id: "proof", ok: false, detail: "No claim to withdraw." });
    return { ok: false, checks };
  }

  if (!persist) return { ok: true, checks };
  const claim = await deps.saveClaim({
    toolUrl: parsed.toolUrl,
    identity: parsed.identity,
    cluster,
    message: req.message,
    signature: req.signature,
    signedDate: parsed.date,
    action: parsed.action,
    category: req.category,
    toolName: req.toolName,
  });
  return { ok: true, claim, checks };
}
