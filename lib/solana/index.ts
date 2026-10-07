import { NotImplemented } from "@/lib/errors";
import type { Cluster, Validator } from "@/lib/types";

/** Reads vote accounts and on-chain validator-info for a cluster. */
export async function fetchValidators(_cluster: Cluster): Promise<Validator[]> {
  throw new NotImplemented("fetchValidators");
}
