import { badRequest, jsonGet } from "@/lib/api";
import { getValidatorProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

const BASE58_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(_req: Request, ctx: { params: Promise<{ identity: string }> }) {
  const { identity } = await ctx.params;
  if (!BASE58_KEY.test(identity)) return badRequest("invalid identity");
  return jsonGet(() => getValidatorProfile(identity), "validator not found");
}
