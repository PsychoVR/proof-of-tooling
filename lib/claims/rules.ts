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
}

export interface RuleOutcome {
  decision: RuleDecision;
  reasons: string[];
}

export const MIN_COMMITS = 5;
export const MIN_AGE_DAYS = 7;
export const MAX_CLAIMS_PER_DAY = 5;

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
  if (ctx.identityClaimsLast24h > MAX_CLAIMS_PER_DAY) {
    reviews.push(`More than ${MAX_CLAIMS_PER_DAY} claims from this identity in 24 hours.`);
  }
  if (ctx.otherClaimants > 0) reviews.push("URL also claimed by other validators.");
  if (reviews.length > 0) return { decision: "review", reasons: reviews };
  return { decision: "accept", reasons: [] };
}
