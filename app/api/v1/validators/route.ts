import { z } from "zod";
import { badRequest, jsonGet } from "@/lib/api";
import { getLeaderboard } from "@/lib/queries";
import { CLUSTERS } from "@/lib/types";

export const dynamic = "force-dynamic";

const query = z.object({
  cluster: z.enum(CLUSTERS).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const parsed = query.safeParse({
    cluster: sp.get("cluster") ?? undefined,
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? undefined,
  });
  if (!parsed.success) return badRequest("invalid query");
  return jsonGet(() => getLeaderboard(parsed.data));
}
