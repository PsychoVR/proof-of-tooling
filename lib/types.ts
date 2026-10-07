// Shared contracts between claims, data and UI code. Do not change without agreement.

export const CLUSTERS = ["mainnet", "testnet", "alpenglow"] as const;
export type Cluster = (typeof CLUSTERS)[number];

export const CATEGORIES = [
  "Monitoring",
  "Explorer",
  "Dashboard",
  "Client",
  "Ops script",
  "Library",
  "Meta",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** `pending` = sent to manual review by the anti-abuse rules; it never counts in totals. */
export const CLAIM_STATUSES = ["active", "pending", "stale", "withdrawn", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export type ToolKind = "repo" | "web";
export type ToolHealth = "active" | "slow" | "dormant" | "unknown";

/** A tool is "claimed" when it has an active signed claim, otherwise "unclaimed" (seed entry). */
export type ToolStatus = "claimed" | "unclaimed";

export interface Validator {
  identity: string;
  cluster: Cluster;
  voteAccount: string;
  name: string | null;
  website: string | null;
  iconUrl: string | null;
  activatedStake: string; // lamports as decimal string (exceeds JS safe ints)
  version: string | null;
  delinquent: boolean;
  updatedAt: string; // ISO 8601
}

export interface Tool {
  id: number;
  slug: string;
  /** Canonical form from normalizeToolUrl: no scheme, no www., e.g. github.com/org/repo. */
  url: string;
  name: string;
  category: Category;
  kind: ToolKind;
  isFork: boolean;
  stars: number | null;
  lastCommitAt: string | null;
  health: ToolHealth;
  createdAt: string;
}

export interface Claim {
  id: number;
  toolId: number;
  identity: string;
  cluster: Cluster;
  message: string;
  signature: string; // base58
  signedDate: string; // YYYY-MM-DD
  status: ClaimStatus;
  verifiedAt: string;
  lastCheckedAt: string | null;
}

export interface Endorsement {
  id: number;
  toolId: number;
  identity: string;
  message: string;
  signature: string;
  createdAt: string;
}

/** Who builds or uses a tool. Seed entries carry only a name; claims add the identity. */
export interface ToolOwner {
  name: string;
  identity: string | null;
}

export interface ToolWithClaims extends Tool {
  status: ToolStatus;
  /** Owner from the seed entry (unclaimed) or from the claim (claimed). */
  owner: ToolOwner | null;
  claims: Claim[];
  claimedBy: Pick<Validator, "identity" | "cluster" | "name">[];
}

export interface ValidatorProfile {
  validator: Validator;
  tools: ToolWithClaims[];
  endorsements: Endorsement[];
}

export interface Stats {
  toolsTotal: number;
  toolsClaimed: number;
  toolsUnclaimed: number;
  validatorsWithTools: number;
  validatorsTotal: number;
  byCategory: Record<Category, number>;
  updatedAt: string;
}

// ---- API responses ----

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Per-tool state in a leaderboard row: a live signed claim or an expired one (listed, not counted). */
export type LeaderboardToolStatus = "signed" | "stale";

export interface LeaderboardTool extends Pick<Tool, "id" | "slug" | "name" | "category" | "url"> {
  status: LeaderboardToolStatus;
}

export interface LeaderboardRow {
  validator: Validator;
  toolCount: number;
  claimedCount: number;
  tools: LeaderboardTool[];
}

/** GET /api/v1/stats */
export type StatsResponse = Stats;
/** GET /api/v1/validators?cluster= */
export type LeaderboardResponse = Page<LeaderboardRow>;
/** GET /api/v1/validators/[identity] */
export type ValidatorProfileResponse = ValidatorProfile;
/** GET /api/v1/tools?category=&status= */
export type ToolsResponse = { items: ToolWithClaims[] };

export type ClaimAction = "claim" | "unclaim";

export interface ParsedClaimMessage {
  action: ClaimAction;
  toolUrl: string; // normalized, e.g. github.com/org/repo
  identity: string;
  date: string; // YYYY-MM-DD
  extras: Record<string, string>;
}

export interface ClaimRequest {
  message: string;
  signature: string;
  /** Category chosen in the claim form; the server falls back to "Ops script" when missing. */
  category?: Category;
  /** Display name for a tool that is not yet in the database. */
  toolName?: string;
}

export type ClaimCheckId =
  | "format"
  | "date"
  | "encoding"
  | "signature"
  | "status"
  | "validator"
  | "proof"
  | "repo"
  | "rules";

export interface ClaimCheckResult {
  id: ClaimCheckId;
  ok: boolean;
  detail?: string;
}

/** POST /api/v1/claims/check */
export interface ClaimCheckResponse {
  ok: boolean;
  /** True when every check passed but the rules require manual review before it counts. */
  inReview?: boolean;
  checks: ClaimCheckResult[];
}

/** POST /api/v1/claims */
export interface ClaimResponse {
  ok: boolean;
  inReview?: boolean;
  claim?: Claim;
  checks: ClaimCheckResult[];
}

export interface RegistryEntry {
  tool: Pick<Tool, "url" | "name" | "category">;
  identity: string;
  cluster: Cluster;
  message: string;
  signature: string;
  status: ClaimStatus;
}

/** GET /registry.json */
export interface RegistryResponse {
  generatedAt: string;
  entries: RegistryEntry[];
}

export interface ApiError {
  error: string;
}
