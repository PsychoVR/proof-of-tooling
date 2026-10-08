import { handleListCandidates } from "@/lib/admin-pools";

export const dynamic = "force-dynamic";

/** Stake pool candidates found on chain; ?status=pending|approved|rejected (default pending), ?limit=&offset=. */
export async function GET(req: Request) {
  return handleListCandidates(req);
}
