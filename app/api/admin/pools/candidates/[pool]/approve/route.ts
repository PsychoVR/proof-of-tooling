import { handleCandidateDecision } from "@/lib/admin-pools";

export const dynamic = "force-dynamic";

/** Body: { "name": "...", "logoId": "id-of-a-file-in-public/pools" }. */
export async function POST(req: Request, { params }: { params: Promise<{ pool: string }> }) {
  return handleCandidateDecision(req, (await params).pool, "approve");
}
