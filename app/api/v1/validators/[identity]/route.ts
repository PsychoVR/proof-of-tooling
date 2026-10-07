import { badRequest, jsonGet } from "@/lib/api";
import { isValidPubkey } from "@/lib/claims";
import { getValidatorProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ identity: string }> }) {
  const { identity } = await ctx.params;
  if (!isValidPubkey(identity)) return badRequest("invalid identity");
  return jsonGet(() => getValidatorProfile(identity), "validator not found");
}
