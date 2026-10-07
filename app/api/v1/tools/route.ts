import { z } from "zod";
import { badRequest, jsonGet } from "@/lib/api";
import { getTools } from "@/lib/queries";
import { CATEGORIES } from "@/lib/types";

export const dynamic = "force-dynamic";

const query = z.object({
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(["claimed", "unclaimed"]).optional(),
});

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const parsed = query.safeParse({
    category: sp.get("category") ?? undefined,
    status: sp.get("status") ?? undefined,
  });
  if (!parsed.success) return badRequest("invalid query");
  return jsonGet(async () => ({ items: await getTools(parsed.data) }));
}
