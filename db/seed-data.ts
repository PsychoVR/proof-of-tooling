import { normalizeToolUrl } from "@/lib/claims/message";
import type { Category } from "@/lib/types";

/** Unclaimed entries: public tools linked from each validator's own site. Not yet signed. */
export interface SeedTool {
  validatorName: string;
  sourceUrl: string;
  name: string;
  slug: string;
  category: Category;
  url: string;
}

const entry = (
  validatorName: string,
  site: string,
  name: string,
  slug: string,
  category: Category,
  url: string,
): SeedTool => ({ validatorName, sourceUrl: `https://${site}`, name, slug, category, url: normalizeToolUrl(url) });

export const SEED_TOOLS: SeedTool[] = [
  entry("Pumpkin's Pool", "pumpkinspool.com", "Watchtower", "watchtower", "Monitoring", "https://pumpkinspool.com/watchtower"),
  entry("Pumpkin's Pool", "pumpkinspool.com", "RugAlert", "rugalert", "Monitoring", "https://pumpkinspool.com/watchtower/rugs"),
  entry("Valid Blocks", "validblocks.com", "Alpenglow Explorer", "alpenglow-explorer", "Explorer", "https://ag.validblocks.com"),
  entry("Valid Blocks", "validblocks.com", "Solana Dashboards", "solana-dashboards", "Dashboard", "https://dashboards.validblocks.com"),
  entry("Overclock", "overclock.one", "Mithril", "mithril", "Client", "https://github.com/Overclock-Validator/mithril"),
  entry("Laine", "stakewiz.com", "Stakewiz", "stakewiz", "Explorer", "https://stakewiz.com"),
  entry("Block Logic", "validators.app", "validators.app", "validators-app", "Explorer", "https://www.validators.app"),
];

export const SEED_ADDED_BY = "seed";
