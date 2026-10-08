import {
  bigint,
  boolean,
  customType,
  date,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { CATEGORIES, CLAIM_STATUSES, CLUSTERS } from "@/lib/types";

export const POOL_CANDIDATE_STATUSES = ["pending", "approved", "rejected"] as const;

export const heartbeat = mysqlTable("heartbeat", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const validators = mysqlTable(
  "validators",
  {
    id: int("id").autoincrement().primaryKey(),
    identity: varchar("identity", { length: 64 }).notNull(),
    cluster: mysqlEnum("cluster", CLUSTERS).notNull(),
    voteAccount: varchar("vote_account", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }),
    website: varchar("website", { length: 512 }),
    iconUrl: varchar("icon_url", { length: 512 }),
    activatedStake: bigint("activated_stake", { mode: "bigint", unsigned: true }).notNull().default(sql`0`),
    version: varchar("version", { length: 64 }),
    delinquent: boolean("delinquent").notNull().default(false),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("validators_identity_cluster_uq").on(t.identity, t.cluster),
    index("validators_vote_account_idx").on(t.voteAccount),
  ],
);

const mediumblob = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "mediumblob" });

/**
 * Icons of verified validators (those with an active claim), downloaded once a day from the url in
 * their on-chain validator-info and served from here. Kept in the database, which survives deploys.
 */
export const validatorIcons = mysqlTable("validator_icons", {
  identity: varchar("identity", { length: 64 }).primaryKey(),
  contentType: varchar("content_type", { length: 32 }).notNull(),
  bytes: mediumblob("bytes").notNull(),
  etag: varchar("etag", { length: 64 }).notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

/**
 * Active stake that each liquid-staking pool delegates to a verified validator, refreshed by the pools job.
 * Only pools at or above the minimum are stored. Rows go when the validator loses its active claim.
 */
export const validatorPoolStake = mysqlTable(
  "validator_pool_stake",
  {
    identity: varchar("identity", { length: 64 }).notNull(),
    poolId: varchar("pool_id", { length: 64 }).notNull(),
    lamports: bigint("lamports", { mode: "bigint", unsigned: true }).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.identity, t.poolId] })],
);

/** When each verified validator was last scanned successfully (also when it has no qualifying pool). */
export const validatorPoolScan = mysqlTable("validator_pool_scan", {
  identity: varchar("identity", { length: 64 }).primaryKey(),
  scannedAt: timestamp("scanned_at").defaultNow().notNull(),
  epoch: int("epoch").notNull(),
});

/**
 * SPL stake pools found on chain that are not in the static registry. They are never shown until an admin
 * approves them with a name and a logo id: names on chain are third-party text anyone can choose.
 */
export const poolCandidates = mysqlTable(
  "pool_candidates",
  {
    pool: varchar("pool", { length: 64 }).primaryKey(),
    poolMint: varchar("pool_mint", { length: 64 }).notNull(),
    validatorList: varchar("validator_list", { length: 64 }).notNull(),
    withdrawAuthority: varchar("withdraw_authority", { length: 64 }).notNull(),
    program: varchar("program", { length: 64 }).notNull(),
    /** Measured from the pool's validator list when it was found: validators with real stake, null before the first measurement. */
    validatorsCount: int("validators_count"),
    /** Active stake across all its validators, in lamports. */
    totalStakeLamports: bigint("total_stake_lamports", { mode: "bigint", unsigned: true }),
    /** Name of the pool's token as published in its metadata. Third-party text: sanitized, display only, never an identity. */
    mintName: varchar("mint_name", { length: 80 }),
    firstSeen: timestamp("first_seen").defaultNow().notNull(),
    lastSeen: timestamp("last_seen").defaultNow().notNull(),
    status: mysqlEnum("status", POOL_CANDIDATE_STATUSES).notNull().default("pending"),
    /** Set on approval. Curated by the admin, sanitized; never read from the chain. */
    name: varchar("name", { length: 80 }),
    /** Set on approval: id of a logo file in public/pools, which is also the pool id on validator profiles. */
    logoId: varchar("logo_id", { length: 40 }),
    decidedAt: timestamp("decided_at"),
    decidedBy: varchar("decided_by", { length: 64 }),
  },
  (t) => [index("pool_candidates_status_idx").on(t.status, t.firstSeen)],
);

/** SFDP membership of verified validators, from the Foundation's public list (only "Approved" counts). */
export const validatorSfdp = mysqlTable("validator_sfdp", {
  identity: varchar("identity", { length: 64 }).primaryKey(),
  participant: boolean("participant").notNull(),
  /** Last attempt, successful or not. */
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
  /** Last attempt that read the list; `participant` is as of this date. */
  lastOkAt: timestamp("last_ok_at"),
});

/** Last run of the periodic parts of the pools job (stake pool discovery, SFDP). */
export const jobRuns = mysqlTable("job_runs", {
  name: varchar("name", { length: 32 }).primaryKey(),
  lastRunAt: timestamp("last_run_at").defaultNow().notNull(),
});

export const tools = mysqlTable(
  "tools",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull(),
    url: varchar("url", { length: 512 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: mysqlEnum("category", CATEGORIES).notNull(),
    kind: mysqlEnum("kind", ["repo", "web"]).notNull(),
    isFork: boolean("is_fork").notNull().default(false),
    stars: int("stars"),
    lastCommitAt: timestamp("last_commit_at"),
    health: mysqlEnum("health", ["active", "slow", "dormant", "unknown"]).notNull().default("unknown"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("tools_url_uq").on(t.url),
    uniqueIndex("tools_slug_uq").on(t.slug),
  ],
);

export const claims = mysqlTable(
  "claims",
  {
    id: int("id").autoincrement().primaryKey(),
    toolId: int("tool_id").notNull().references(() => tools.id),
    identity: varchar("identity", { length: 64 }).notNull(),
    cluster: mysqlEnum("cluster", CLUSTERS).notNull(),
    message: text("message").notNull(),
    signature: varchar("signature", { length: 128 }).notNull(),
    signedDate: date("signed_date", { mode: "string" }).notNull(),
    status: mysqlEnum("status", CLAIM_STATUSES).notNull().default("active"),
    verifiedAt: timestamp("verified_at").defaultNow().notNull(),
    lastCheckedAt: timestamp("last_checked_at"),
    /** Consecutive failed proof-file checks; reset by a successful one. */
    failures: int("failures").notNull().default(0),
  },
  (t) => [
    uniqueIndex("claims_tool_identity_uq").on(t.toolId, t.identity),
    index("claims_identity_idx").on(t.identity),
    index("claims_status_id_idx").on(t.status, t.id),
  ],
);

export const endorsements = mysqlTable(
  "endorsements",
  {
    id: int("id").autoincrement().primaryKey(),
    toolId: int("tool_id").notNull().references(() => tools.id),
    identity: varchar("identity", { length: 64 }).notNull(),
    message: text("message").notNull(),
    signature: varchar("signature", { length: 128 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("endorsements_tool_identity_uq").on(t.toolId, t.identity)],
);

export const seedEntries = mysqlTable(
  "seed_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    toolId: int("tool_id").notNull().references(() => tools.id),
    validatorName: varchar("validator_name", { length: 255 }).notNull(),
    sourceUrl: varchar("source_url", { length: 512 }).notNull(),
    addedBy: varchar("added_by", { length: 128 }).notNull(),
  },
  (t) => [index("seed_entries_tool_idx").on(t.toolId)],
);

/** Moderation audit trail: one row per approve or reject decision on a pending claim. */
export const claimDecisions = mysqlTable(
  "claim_decisions",
  {
    id: int("id").autoincrement().primaryKey(),
    claimId: int("claim_id").notNull().references(() => claims.id),
    decision: mysqlEnum("decision", ["approve", "reject"]).notNull(),
    previousStatus: mysqlEnum("previous_status", CLAIM_STATUSES).notNull(),
    actor: varchar("actor", { length: 64 }).notNull(),
    decidedAt: timestamp("decided_at").defaultNow().notNull(),
  },
  (t) => [index("claim_decisions_claim_idx").on(t.claimId)],
);

/**
 * Claim attempts that did not pass, to see where people get stuck. Only the failing step and the
 * kind of request are stored: no identity, no IP, no URL. Rows older than 30 days are pruned.
 */
export const claimFailures = mysqlTable(
  "claim_failures",
  {
    id: int("id").autoincrement().primaryKey(),
    reason: varchar("reason", { length: 32 }).notNull(),
    kind: mysqlEnum("kind", ["check", "register"]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("claim_failures_created_idx").on(t.createdAt)],
);
