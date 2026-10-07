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
 * no trailing slash and no `.git` suffix (the path keeps its case).
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
  return slash === -1 ? host : host + stripped.slice(slash);
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
