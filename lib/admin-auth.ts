import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/** Constant-time check of `Authorization: Bearer <ADMIN_SECRET>`. Disabled when the variable is unset. */
export function adminAuthorized(header: string | null): boolean {
  const secret = getEnv().ADMIN_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
