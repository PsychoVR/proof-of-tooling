import { runPools } from "@/jobs/pools";
import { runCron } from "@/lib/cron-handler";

export const dynamic = "force-dynamic";
// Stake scans and the SFDP download are slow; the job stops starting new scans after 240 s.
export const maxDuration = 300;

export async function POST(req: Request) {
  return runCron(req, () => runPools());
}
