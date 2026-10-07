export type RuleDecision = "accept" | "review" | "reject";

export interface RepoMetadata {
  isPrivate: boolean;
  archived: boolean;
  isFork: boolean;
  /** Total commits on the default branch. */
  commitCount: number;
  /** Commits not inherited from the parent. Only relevant for forks. */
  ownCommits: number;
  createdAt: string; // ISO 8601
}

export interface RuleContext {
  now: Date;
  /** Number of claims by the same identity in the last 24 hours. */
  identityClaimsLast24h: number;
  /** The same identity already holds an active claim on this URL. */
  alreadyClaimedBySameIdentity: boolean;
  /** Other identities with a claim on this URL. */
  otherClaimants: number;
  /** Active claims this identity already holds on other tools (all kinds). */
  identityActiveClaims?: number;
}

export interface WebRuleContext extends RuleContext {
  /** Other tools of this identity (active or pending) under the same registrable domain. */
  sameDomainClaims: number;
  /** Claims of any identity (active or pending) on other tools under the same registrable domain. */
  domainClaimsAllIdentities?: number;
}

export interface RuleOutcome {
  decision: RuleDecision;
  reasons: string[];
}

export const MIN_COMMITS = 5;
export const MIN_AGE_DAYS = 7;
/** Own commits a fork needs; fewer (but more than none) go to review. */
export const MIN_FORK_OWN_COMMITS = 5;
export const MAX_CLAIMS_PER_DAY = 5;
/** Active claims one identity may hold before new ones need a review. */
export const MAX_ACTIVE_PER_IDENTITY = 25;
/** Claims of all identities together under one registrable domain before new ones need a review. */
export const MAX_CLAIMS_PER_DOMAIN_TOTAL = 10;
/** Tools one identity may create through claims (claim and unclaim churn does not free slots). */
export const MAX_TOOLS_CREATED_PER_IDENTITY = 20;
/** Tools one identity may hold under the same registrable domain before a review is needed. */
export const MAX_TOOLS_PER_DOMAIN = 5;
/** Claims one identity may have waiting for manual review; above this new ones are refused. */
export const MAX_PENDING_PER_IDENTITY = 3;

export function evaluateRepoRules(repo: RepoMetadata, ctx: RuleContext): RuleOutcome {
  const rejects: string[] = [];
  if (repo.isPrivate) rejects.push("Repository is private.");
  if (repo.archived) rejects.push("Repository is archived.");
  if (repo.commitCount === 0) rejects.push("Repository is empty.");
  if (repo.isFork && repo.ownCommits === 0) rejects.push("Fork without commits of its own.");
  if (ctx.alreadyClaimedBySameIdentity) rejects.push("This identity already claimed this URL.");
  if (rejects.length > 0) return { decision: "reject", reasons: rejects };

  const reviews: string[] = [];
  if (repo.commitCount < MIN_COMMITS) reviews.push(`Fewer than ${MIN_COMMITS} commits.`);
  const ageDays = (ctx.now.getTime() - Date.parse(repo.createdAt)) / 86_400_000;
  if (ageDays < MIN_AGE_DAYS) reviews.push(`Repository created less than ${MIN_AGE_DAYS} days ago.`);
  if (repo.isFork && repo.ownCommits < MIN_FORK_OWN_COMMITS) reviews.push(`Fork with fewer than ${MIN_FORK_OWN_COMMITS} commits of its own.`);
  reviews.push(...abuseReviews(ctx));
  if (reviews.length > 0) return { decision: "review", reasons: reviews };
  return { decision: "accept", reasons: [] };
}

/** Rate and contention rules shared by repos and web tools. */
function abuseReviews(ctx: RuleContext): string[] {
  const reviews: string[] = [];
  if (ctx.identityClaimsLast24h > MAX_CLAIMS_PER_DAY) {
    reviews.push(`More than ${MAX_CLAIMS_PER_DAY} claims from this identity in 24 hours.`);
  }
  if (ctx.otherClaimants > 0) reviews.push("URL also claimed by other validators.");
  if ((ctx.identityActiveClaims ?? 0) >= MAX_ACTIVE_PER_IDENTITY) {
    reviews.push(`This identity already holds ${MAX_ACTIVE_PER_IDENTITY} or more active claims.`);
  }
  return reviews;
}

/**
 * Web tools have no repo metadata, so only the shared rules apply, plus a cap on tools per
 * registrable domain so that wildcard subdomains cannot inflate the ranking unreviewed.
 */
export function evaluateWebRules(ctx: WebRuleContext): RuleOutcome {
  if (ctx.alreadyClaimedBySameIdentity) {
    return { decision: "reject", reasons: ["This identity already claimed this URL."] };
  }
  const reviews = abuseReviews(ctx);
  if (ctx.sameDomainClaims >= MAX_TOOLS_PER_DOMAIN) {
    reviews.push(`This identity already holds ${MAX_TOOLS_PER_DOMAIN} or more tools under this domain.`);
  }
  if ((ctx.domainClaimsAllIdentities ?? 0) >= MAX_CLAIMS_PER_DOMAIN_TOTAL) {
    reviews.push(`This domain already has ${MAX_CLAIMS_PER_DOMAIN_TOTAL} or more claims.`);
  }
  return reviews.length > 0 ? { decision: "review", reasons: reviews } : { decision: "accept", reasons: [] };
}
