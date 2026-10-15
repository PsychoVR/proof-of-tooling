import { SITE_URL, TWITTER_HANDLE } from "@/lib/seo";
import type { PoolBadge, SfdpStatus } from "@/lib/types";

/** The board is shown once at least this many validators hold an active claim. */
export const TOP_MIN_VALIDATORS = 5;
export const TOP_SIZE = 10;

export interface BuilderCount {
  identity: string;
  toolCount: number;
  /** Date of the identity's earliest active claim: breaks ties in favour of whoever signed first. */
  firstClaimAt: Date;
}

export interface TopEntry {
  rank: number;
  identity: string;
  name: string;
  toolCount: number;
  firstClaimAt: string;
}

/** A live entry also carries what the page shows next to the name. */
export interface LiveTopEntry extends TopEntry {
  iconUrl: string | null;
  pools: PoolBadge[];
  sfdp: SfdpStatus | null;
}

/** Most tools first; equal counts by earliest first claim, then by identity so the order never flips. */
export function rankBuilders<T extends BuilderCount>(rows: T[], limit = TOP_SIZE): (T & { rank: number })[] {
  return [...rows]
    .sort((a, b) => b.toolCount - a.toolCount || a.firstClaimAt.getTime() - b.firstClaimAt.getTime() || (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0))
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export const isTopVisible = (validatorsWithClaims: number) => validatorsWithClaims >= TOP_MIN_VALIDATORS;

/** Prefilled post for X: the rank, the count, the handle and the profile link. */
export function shareRankUrl(e: Pick<TopEntry, "rank" | "identity" | "toolCount">, period?: string): string {
  const tools = `${e.toolCount} ${e.toolCount === 1 ? "tool" : "tools"}`;
  const where = period ? `the ${period} Top tool builders` : "the Top tool builders";
  const text = `I'm #${e.rank} on ${where} for Solana validators with ${tools}. ${TWITTER_HANDLE}`;
  const url = `${SITE_URL}/v/${encodeURIComponent(e.identity)}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const isMonthParam = (s: string) => MONTH_RE.test(s);

/** "2026-10" for a date, in UTC. */
export const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
export const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const previousMonth = (d: Date) => monthOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));

/** "October 2026" for "2026-10". */
export function monthLabel(month: string): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
