import { handleListPending } from "@/lib/admin-claims";

export const dynamic = "force-dynamic";

/** Pending claims awaiting review, each with the etag to send as If-Match when deciding. */
export async function GET(req: Request) {
  return handleListPending(req);
}
