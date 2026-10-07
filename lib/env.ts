import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  // Separate from CRON_SECRET: protects the admin moderation endpoints. Unset disables them.
  ADMIN_SECRET: z.string().min(16).optional(),
  HELIUS_RPC_URL: z.string().url().optional(),
  GITHUB_TOKEN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

// Lazy: validated on first use so `next build` does not fail when vars are missing.
let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
