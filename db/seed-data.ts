import { normalizeToolUrl } from "@/lib/claims/message";
import type { Category } from "@/lib/types";

/**
 * Unclaimed entries: public tools built by teams that run a Solana mainnet validator.
 * Not signed. Shown as "Unclaimed · built by <validatorName>" and never counted towards
 * any validator's ranking until the owner signs a claim.
 *
 * sourceUrl points to the public page that ties the tool (or its builder) to a validator,
 * so every attribution can be audited.
 */
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
  sourceUrl: string,
  name: string,
  slug: string,
  category: Category,
  url: string,
): SeedTool => ({ validatorName, sourceUrl, name, slug, category, url: normalizeToolUrl(url) });

export const SEED_TOOLS: SeedTool[] = [
  // ── Community validators ────────────────────────────────────────────────
  entry("Pumpkin's Pool", "https://pumpkinspool.com", "Watchtower", "watchtower", "Monitoring", "https://pumpkinspool.com/watchtower"),
  entry("Pumpkin's Pool", "https://pumpkinspool.com", "RugAlert", "rugalert", "Monitoring", "https://pumpkinspool.com/watchtower/rugs"),
  entry("Valid Blocks", "https://ag.validblocks.com", "Alpenglow Explorer", "alpenglow-explorer", "Explorer", "https://ag.validblocks.com"),
  entry("Valid Blocks", "https://validblocks.com/stake-sol", "Solana Dashboards", "solana-dashboards", "Dashboard", "https://dashboards.validblocks.com"),
  entry("Overclock", "https://overclock.one", "Mithril", "mithril", "Client", "https://github.com/Overclock-Validator/mithril"),
  entry("Laine (SOL Strategies)", "https://app.marinade.finance/learn/validator-spotlight-laine/", "Stakewiz", "stakewiz", "Explorer", "https://stakewiz.com"),
  entry("SOL Strategies", "https://solanacompass.com/projects/sol-strategies", "solana-validator-failover", "solana-validator-failover", "Ops script", "https://github.com/sol-strategies/solana-validator-failover"),
  entry("SOL Strategies", "https://solanacompass.com/projects/sol-strategies", "solana-validator-ha", "solana-validator-ha", "Ops script", "https://github.com/SOL-Strategies/solana-validator-ha"),
  entry("Block Logic", "https://solanacompass.com/projects/block-logic", "validators.app", "validators-app", "Explorer", "https://www.validators.app"),
  entry("Solana Compass", "https://solanacompass.com/our-validator", "Solana Compass", "solana-compass", "Dashboard", "https://solanacompass.com"),
  entry("Shinobi Systems", "https://www.stakeview.app", "StakeView.app", "stakeview", "Dashboard", "https://www.stakeview.app"),
  entry("Epoch.Day", "https://epoch.day", "Epoch.Day", "epoch-day", "App", "https://epoch.day"),
  entry("Solya", "https://solya.studio", "SONDA", "sonda", "Dashboard", "https://github.com/SolyaUk/sonda-network"),
  entry("ART3MIS.CLOUD", "https://art3mis.cloud", "lead-inspector", "lead-inspector", "Ops script", "https://github.com/a3mc/lead-inspector"),
  entry("ART3MIS.CLOUD", "https://art3mis.cloud", "vote-inclusion-analyzer", "vote-inclusion-analyzer", "Ops script", "https://github.com/a3mc/vote-inclusion-analyzer"),
  entry("ART3MIS.CLOUD", "https://art3mis.cloud", "sleepy_ui", "sleepy-ui", "Monitoring", "https://github.com/a3mc/sleepy_ui"),
  entry("ART3MIS.CLOUD", "https://art3mis.cloud", "abracadabra", "abracadabra", "Ops script", "https://github.com/a3mc/abracadabra"),
  entry("ELSOUL LABO (ERPC)", "https://slv.dev/en/news/2024/04/05/elsoul-labo-ascends-to-solana-mainnet-validator", "SLV", "slv", "Ops script", "https://github.com/ValidatorsDAO/slv"),
  entry("ELSOUL LABO (ERPC)", "https://validators.solutions", "Validators Solutions", "validators-solutions", "Dashboard", "https://validators.solutions"),
  entry("Chainflow", "https://chainflow.io/introducing-solana-mission-control/", "Solana Mission Control", "solana-mission-control", "Monitoring", "https://github.com/Chainflow/solana-mission-control"),

  // ── Infrastructure companies that also run a validator ──────────────────
  entry("Anza", "https://anza.xyz", "Agave", "agave", "Client", "https://github.com/anza-xyz/agave"),
  entry("Jito", "https://jito.wtf", "jito-solana", "jito-solana", "Client", "https://github.com/jito-foundation/jito-solana"),
  entry("Rakurai", "https://rakurai.io", "rakurai-agave", "rakurai-agave", "Client", "https://github.com/rakurai-io/rakurai-agave"),
  entry("Helius", "https://www.helius.dev/validator", "Orb", "orb", "Explorer", "https://orb.helius.dev"),
  entry("Helius", "https://www.helius.dev/validator", "Helius SDK", "helius-sdk", "Library", "https://github.com/helius-labs/helius-sdk"),
  entry("Chorus One", "https://forum.jito.network/t/delegate-proposal-chorus-one/377", "Chorus One SDK", "chorus-one-sdk", "Library", "https://github.com/ChorusOne/chorus-one-sdk"),
  entry("Jupiter", "https://docs.jup.ag/user-docs/earn/stake-sol/faq", "Jupiter", "jupiter", "App", "https://jup.ag"),
];

export const SEED_ADDED_BY = "seed";