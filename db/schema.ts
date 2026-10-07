import {
  bigint,
  boolean,
  date,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { CATEGORIES, CLAIM_STATUSES, CLUSTERS } from "@/lib/types";

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
