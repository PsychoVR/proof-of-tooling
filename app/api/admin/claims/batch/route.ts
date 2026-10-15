import { handleBatch } from "@/lib/admin-claims";

export const dynamic = "force-dynamic";

/** Approves or rejects several pending claims at once, with a reason. Body: { decision, reason, claims: [{ id, etag }] }. */
export async function POST(req: Request) {
  return handleBatch(req);
}
