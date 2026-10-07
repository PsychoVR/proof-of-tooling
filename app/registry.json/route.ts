import { jsonGet } from "@/lib/api";
import { getRegistry } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonGet(getRegistry);
}
