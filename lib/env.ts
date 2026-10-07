import { z } from "zod";

// An empty variable (`NAME=` copied from .env.example) means "not set", never a validation error.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  HELIUS_RPC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  GITHUB_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});

// ADMIN_SECRET is deliberately not part of this schema: a missing or invalid value must switch the
// admin endpoints off (see lib/admin-auth.ts), never take the whole site down.

export type Env = z.infer<typeof schema>;

// Lazy: validated on first use so `next build` does not fail when vars are missing.
let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
