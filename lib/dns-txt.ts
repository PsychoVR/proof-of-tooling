import { Resolver } from "node:dns/promises";
import type { TxtResolver } from "@/lib/claims";

const QUERY_TIMEOUT_MS = 3000;
const OVERALL_TIMEOUT_MS = 5000;

type TxtLookup = (host: string) => Promise<string[][]>;

/**
 * Builds a TXT resolver with a hard overall deadline on top of the per-query timeout, so a
 * stalled resolver can never hold a request open. Rejects on timeout or any DNS error.
 */
export function createTxtResolver(lookup: TxtLookup, overallMs = OVERALL_TIMEOUT_MS): TxtResolver {
  return (host) =>
    new Promise<string[][]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("dns timeout")), overallMs);
      lookup(host).then(
        (records) => {
          clearTimeout(timer);
          resolve(records);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
}

/** System DNS servers, short timeout, a single try. */
export const resolveTxt: TxtResolver = createTxtResolver((host) => {
  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: 1 });
  return resolver.resolveTxt(host);
});
