import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

export function cronAuthorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${getEnv().CRON_SECRET}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
