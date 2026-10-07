import { z } from "zod";

export interface Env {
  /** The only required variable: without a database nothing works. */
  DATABASE_URL: string;
  /** Bearer secret of the /api/cron/* endpoints. Missing or shorter than 16 characters: those endpoints stay off. */
  CRON_SECRET?: string;
  /** RPC endpoint for Solana mainnet. Invalid: ignored, the public RPC is used. */
  HELIUS_RPC_URL?: string;
  /** Raises the GitHub API rate limit. Invalid: ignored. */
  GITHUB_TOKEN?: string;
}

// Whitespace pasted into a variable (or an empty `NAME=` from .env.example) means "not set".
const clean = (v: string | undefined) => {
  const t = v?.trim();
  return t ? t : undefined;
};

// Every variable except DATABASE_URL degrades to "feature off" instead of failing the whole site.
// A value that is present but invalid is reported by name only, never printed.
function optional(raw: Record<string, string | undefined>, name: string, schema: z.ZodType<string>): string | undefined {
  const value = clean(raw[name]);
  if (value === undefined) return undefined;
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  console.warn(`${name} is set but invalid and was ignored`);
  return undefined;
}

/** Proxy settings used to find the client IP. Needs no database, so it never throws. */
export function loadProxyConfig(raw: Record<string, string | undefined>): { header?: string; hops: number } {
  const header = optional(raw, "TRUSTED_IP_HEADER", z.string().regex(/^[A-Za-z0-9-]{1,64}$/))?.toLowerCase();
  const hops = optional(raw, "TRUSTED_PROXY_HOPS", z.string().regex(/^[1-9]\d?$/));
  return { header, hops: hops ? Number(hops) : 1 };
}

export function loadEnv(raw: Record<string, string | undefined>): Env {
  return {
    DATABASE_URL: z.string().min(1).parse(clean(raw.DATABASE_URL)),
    CRON_SECRET: optional(raw, "CRON_SECRET", z.string().min(16)),
    HELIUS_RPC_URL: optional(raw, "HELIUS_RPC_URL", z.string().url()),
    GITHUB_TOKEN: optional(raw, "GITHUB_TOKEN", z.string().min(1)),
  };
}

// ADMIN_SECRET is read by lib/admin-auth.ts for the same reason: a missing or invalid value switches
// the admin endpoints off, never the site.

// Lazy: validated on first use so `next build` does not fail when vars are missing.
let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= loadEnv(process.env);
  return cached;
}
