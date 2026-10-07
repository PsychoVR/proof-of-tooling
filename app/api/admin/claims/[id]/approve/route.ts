import { handleDecision } from "@/lib/admin-claims";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDecision(req, (await params).id, "approve");
}
