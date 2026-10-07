import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`. Without a valid secret, nobody is authorized. */
export function cronAuthorized(header: string | null): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
