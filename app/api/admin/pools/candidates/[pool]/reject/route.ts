import { handleCandidateDecision } from "@/lib/admin-pools";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ pool: string }> }) {
  return handleCandidateDecision(req, (await params).pool, "reject");
}
