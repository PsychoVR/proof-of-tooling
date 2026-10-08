import type { ClaimAction, ParsedClaimMessage } from "@/lib/types";

export const MESSAGE_PREFIX = "proof-of-tooling v1";
const SEPARATOR = " | ";
const ACTIONS: readonly string[] = ["claim", "unclaim"];
const BASE58_PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EXTRA_KEY_RE = /^[a-z][a-z0-9_]*$/;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

export function isPrintableAscii(s: string): boolean {
  return PRINTABLE_ASCII.test(s);
}

/**
 * Canonical tool URL: no scheme, no `www.`, lowercase host, no query/hash,
 * no trailing slash and no `.git` suffix. The path keeps its case, except on github.com where it is
 * lowercased (GitHub treats owner and repo names case-insensitively).
 */
export function normalizeToolUrl(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const slash = stripped.indexOf("/");
  const host = (slash === -1 ? stripped : stripped.slice(0, slash)).toLowerCase().replace(/^www\./, "");
  if (slash === -1) return host;
  const path = stripped.slice(slash);
  // GitHub owners and repos are case-insensitive, so one repo has exactly one canonical URL.
  return host === "github.com" ? host + path.toLowerCase() : host + path;
}

/** Adds the scheme for display and links; storage always uses the canonical form. */
export function toolDisplayUrl(canonical: string): string {
  return `https://${canonical}`;
}

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function buildClaimMessage(input: {
  action: ClaimAction;
  toolUrl: string;
  identity: string;
  date: string;
  extras?: Record<string, string>;
}): string {
  const parts = [MESSAGE_PREFIX, input.action, normalizeToolUrl(input.toolUrl), input.identity, input.date];
  for (const [k, v] of Object.entries(input.extras ?? {})) parts.push(`${k}=${v}`);
  return parts.join(SEPARATOR);
}

/** Parses a v1 claim line. Returns null when the format is invalid. */
export function parseClaimMessage(message: string): ParsedClaimMessage | null {
  if (!isPrintableAscii(message)) return null;
  const parts = message.split(SEPARATOR);
  if (parts.length < 5 || parts[0] !== MESSAGE_PREFIX) return null;
  const [, action, url, identity, date, ...rest] = parts;
  if (!ACTIONS.includes(action)) return null;
  const toolUrl = normalizeToolUrl(url);
  if (toolUrl === "" || /\s/.test(toolUrl)) return null;
  if (!BASE58_PUBKEY.test(identity)) return null;
  if (!isValidDate(date)) return null;
  const extras: Record<string, string> = {};
  for (const part of rest) {
    const eq = part.indexOf("=");
    if (eq === -1) return null;
    const key = part.slice(0, eq);
    if (!EXTRA_KEY_RE.test(key) || key in extras) return null;
    extras[key] = part.slice(eq + 1);
  }
  return { action: action as ClaimAction, toolUrl, identity, date, extras };
}

export const MAX_SIGNATURE_AGE_DAYS = 7;
export const MAX_FUTURE_DAYS = 1;
const DAY_MS = 86_400_000;

/** Whole UTC calendar days between a signed date (YYYY-MM-DD) and today; negative when it is ahead. */
export function daysSince(date: string, now: Date): number {
  const signed = Date.parse(`${date}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - signed) / DAY_MS);
}

/** Today's UTC date as YYYY-MM-DD, the date a fresh claim message carries. */
export function utcToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Whether the server would accept a message dated `date` right now (see verifyClaimSignature). */
export function signatureDateStatus(date: string, now: Date): "ok" | "stale" | "future" {
  const age = daysSince(date, now);
  if (age > MAX_SIGNATURE_AGE_DAYS) return "stale";
  if (age < -MAX_FUTURE_DAYS) return "future";
  return "ok";
}
