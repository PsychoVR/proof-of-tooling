import { refreshIconFor } from "@/jobs/icons";
import { refreshPoolsFor } from "@/jobs/pools";

/**
 * A validator just got an active claim (new claim, manual approval or a stale claim that passes again): fetch its
 * icon and rescan its stake pools now instead of waiting for the daily jobs. Each part is best effort and never
 * throws; the pools scan is skipped if the validator was scanned in the last 20 hours.
 */
export async function onClaimActivated(identity: string): Promise<void> {
  await Promise.all([refreshIconFor(identity), refreshPoolsFor(identity)]);
}
