import { timingSafeEqual } from "node:crypto";

export const MIN_ADMIN_SECRET_LENGTH = 16;

/**
 * The admin secret, or null when the admin endpoints must stay off: unset, empty, shorter than
 * 16 characters, or equal to CRON_SECRET (the two must be different credentials).
 */
export function adminSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.ADMIN_SECRET;
  if (!s || s.length < MIN_ADMIN_SECRET_LENGTH || s === env.CRON_SECRET) return null;
  return s;
}

/** Constant-time check of `Authorization: Bearer <ADMIN_SECRET>`. */
export function adminAuthorized(header: string | null): boolean {
  const secret = adminSecret();
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
