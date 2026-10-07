import { jsonGet } from "@/lib/api";
import { getStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonGet(getStats);
}
