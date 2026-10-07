import { handleClaimRequest } from "@/lib/claims-route";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handleClaimRequest(req, false);
}
