import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { validators } from "@/db/schema";
import { fetchValidators } from "@/lib/solana/validators";
import { CLUSTERS, type Cluster, type Validator } from "@/lib/types";

export interface IngestDeps {
  fetchValidators: (cluster: Cluster) => Promise<Validator[]>;
  upsert: (rows: Validator[]) => Promise<void>;
  clusters?: readonly Cluster[];
}

export interface ClusterReport {
  cluster: Cluster;
  ok: boolean;
  count: number;
  ms: number;
  error?: string;
}

const CHUNK = 500;

export async function upsertValidators(rows: Validator[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((v) => ({
      identity: v.identity,
      cluster: v.cluster,
      voteAccount: v.voteAccount,
      name: v.name,
      website: v.website,
      iconUrl: v.iconUrl,
      activatedStake: BigInt(v.activatedStake),
      version: v.version,
      delinquent: v.delinquent,
    }));
    await db
      .insert(validators)
      .values(chunk)
      .onDuplicateKeyUpdate({
        set: {
          voteAccount: sql`values(${validators.voteAccount})`,
          name: sql`values(${validators.name})`,
          website: sql`values(${validators.website})`,
          iconUrl: sql`values(${validators.iconUrl})`,
          activatedStake: sql`values(${validators.activatedStake})`,
          version: sql`values(${validators.version})`,
          delinquent: sql`values(${validators.delinquent})`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });
  }
}

const defaults: IngestDeps = { fetchValidators: (c) => fetchValidators(c), upsert: upsertValidators };

/** Refreshes validators for every cluster in parallel; one cluster failing never blocks the others. */
export async function runIngest(deps: IngestDeps = defaults): Promise<ClusterReport[]> {
  const clusters = deps.clusters ?? CLUSTERS;
  return Promise.all(
    clusters.map(async (cluster): Promise<ClusterReport> => {
      const t0 = Date.now();
      try {
        const rows = await deps.fetchValidators(cluster);
        // An empty set means a bad RPC answer, not a cluster without validators.
        if (rows.length === 0) throw new Error("no validators returned");
        await deps.upsert(rows);
        return { cluster, ok: true, count: rows.length, ms: Date.now() - t0 };
      } catch (err) {
        return {
          cluster,
          ok: false,
          count: 0,
          ms: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}
