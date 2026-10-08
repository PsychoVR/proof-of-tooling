import { and, asc, eq, exists, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { claims, validatorIcons, validators } from "@/db/schema";
import { ENABLED_CLUSTERS } from "@/lib/clusters";
import { createSafeBinaryFetcher } from "@/lib/safe-fetch";
import { iconEtag, MAX_ICON_BYTES, sniffIconType, type IconType } from "@/lib/validator-icons";

/** Icons refreshed per run, oldest first, so a long list is covered over a few days instead of one long request. */
const MAX_PER_RUN = 100;
const POOL = 4;

export interface IconTarget {
  identity: string;
  iconUrl: string;
}

export interface IconDeps {
  /** Verified validators (with an active claim) that publish an icon url, least recently fetched first. */
  targets: () => Promise<IconTarget[]>;
  fetchIcon: (url: string) => Promise<{ status: number; body: Buffer }>;
  save: (identity: string, icon: { contentType: IconType; bytes: Buffer; etag: string }) => Promise<void>;
  /** Drops stored icons of identities that are no longer targets, plus the given ones. Returns how many rows went. */
  remove: (opts: { keep: string[]; also: string[] }) => Promise<number>;
}

export interface IconReport {
  checked: number;
  saved: number;
  /** The url answered with something that is not an accepted image: any stored icon is dropped. */
  rejected: number;
  /** Network or HTTP failure: the stored icon, if any, is kept. */
  failed: number;
  removed: number;
}

const db = () => getDb();

export const defaultIconDeps: IconDeps = {
  async targets() {
    const rows = await db()
      .select({ identity: validators.identity, iconUrl: validators.iconUrl })
      .from(validators)
      .leftJoin(validatorIcons, eq(validatorIcons.identity, validators.identity))
      .where(
        and(
          inArray(validators.cluster, [...ENABLED_CLUSTERS]),
          isNotNull(validators.iconUrl),
          exists(db().select({ one: claims.id }).from(claims).where(and(eq(claims.identity, validators.identity), eq(claims.status, "active")))),
        ),
      )
      .orderBy(asc(sql`${validatorIcons.fetchedAt} is not null`), asc(validatorIcons.fetchedAt));
    const seen = new Set<string>();
    const out: IconTarget[] = [];
    for (const r of rows) {
      if (!r.iconUrl || seen.has(r.identity)) continue;
      seen.add(r.identity);
      out.push({ identity: r.identity, iconUrl: r.iconUrl });
    }
    return out;
  },
  fetchIcon: createSafeBinaryFetcher({ maxBytes: MAX_ICON_BYTES, timeoutMs: 5000, maxRedirects: 3 }),
  async save(identity, icon) {
    await db()
      .insert(validatorIcons)
      .values({ identity, contentType: icon.contentType, bytes: icon.bytes, etag: icon.etag })
      .onDuplicateKeyUpdate({
        set: { contentType: icon.contentType, bytes: icon.bytes, etag: icon.etag, fetchedAt: sql`CURRENT_TIMESTAMP` },
      });
  },
  async remove({ keep, also }) {
    const stored = (await db().select({ identity: validatorIcons.identity }).from(validatorIcons)).map((r) => r.identity);
    const keepSet = new Set(keep);
    const dropSet = new Set(also);
    const gone = stored.filter((id) => !keepSet.has(id) || dropSet.has(id));
    if (gone.length === 0) return 0;
    const [res] = await db().delete(validatorIcons).where(inArray(validatorIcons.identity, gone));
    return res.affectedRows;
  },
};

/**
 * Downloads the on-chain icon of every verified validator and keeps it in the database. The url is
 * third-party input: it goes through the safe fetcher (https, public addresses, few redirects,
 * 5 s, 500 KB) and the bytes must be a raster image, whatever the server says they are.
 */
export async function runIcons(deps: IconDeps = defaultIconDeps): Promise<IconReport> {
  const all = await deps.targets();
  const batch = all.slice(0, MAX_PER_RUN);
  const report: IconReport = { checked: batch.length, saved: 0, rejected: 0, failed: 0, removed: 0 };
  const rejected: string[] = [];

  let next = 0;
  const worker = async () => {
    while (next < batch.length) {
      const t = batch[next++];
      try {
        const res = await deps.fetchIcon(t.iconUrl);
        const type = res.status === 200 && res.body.length > 0 ? sniffIconType(res.body) : null;
        if (res.status !== 200) {
          report.failed++;
        } else if (!type) {
          report.rejected++;
          rejected.push(t.identity);
        } else {
          await deps.save(t.identity, { contentType: type, bytes: res.body, etag: iconEtag(res.body) });
          report.saved++;
        }
      } catch {
        report.failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, batch.length) }, worker));

  report.removed = await deps.remove({ keep: all.map((t) => t.identity), also: rejected });
  return report;
}
