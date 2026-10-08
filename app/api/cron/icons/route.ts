import { runIcons } from "@/jobs/icons";
import { runCron } from "@/lib/cron-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  return runCron(req, () => runIcons());
}
