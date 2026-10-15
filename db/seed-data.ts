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

  // 0base.vc
  entry("0base.vc", "https://0base.vc", "0base-exporter", "0base-exporter", "Monitoring", "https://github.com/0base-vc/0base-exporter"),
  entry("0base.vc", "https://0base.vc", "fine-peers", "0base-fine-peers", "Ops script", "https://github.com/0base-vc/fine-peers"),
  entry("0base.vc", "https://github.com/0base-vc/whoearns-live", "whoearns-live", "whoearns-live", "Dashboard", "https://github.com/0base-vc/whoearns-live"),

  // [NODERS]
  entry("[NODERS]", "https://github.com/noders-team", "solana-exporter", "noders-solana-exporter", "Monitoring", "https://github.com/noders-team/solana-exporter"),

  // Absolute Guard
  entry("Absolute Guard", "https://github.com/a-guard", "last-sfdp-rejects", "aguard-last-sfdp-rejects", "Monitoring", "https://github.com/a-guard/last-sfdp-rejects"),
  entry("Absolute Guard", "https://github.com/a-guard", "malicious-validators", "aguard-malicious-validators", "Monitoring", "https://github.com/a-guard/malicious-validators"),

  // Alchemy
  entry("Alchemy", "https://www.alchemy.com", "solana-hello-world", "alchemy-solana-hello-world", "App", "https://github.com/alchemyplatform/solana-hello-world"),
  entry("Alchemy", "https://www.alchemy.com", "solana-hello-world-2025", "alchemy-solana-hello-world-2025", "App", "https://github.com/alchemyplatform/solana-hello-world-2025"),
  entry("Alchemy", "https://www.alchemy.com", "solana-nft-tutorial", "alchemy-solana-nft-tutorial", "App", "https://github.com/alchemyplatform/solana-nft-tutorial"),

  // Allnodes
  entry("Allnodes", "https://ethereum.org/ko/developers/tools/publicnode-allnodes/", "PublicNode Solana RPC", "allnodes-publicnode-solana", "App", "https://solana.publicnode.com"),

  // Anagram
  entry("Anagram", "https://www.solanacompass.com/projects/anagram", "Bonsol", "bonsol", "Library", "https://github.com/bonsol-collective/bonsol"),
  entry("Anagram", "https://www.solanacompass.com/projects/anagram", "Solana Development Container", "anagram-solana-devcontainer", "Ops script", "https://github.com/anagrambuild/solana"),
  entry("Anagram", "https://www.solanacompass.com/projects/anagram", "Swig Wallet", "anagram-swig-wallet", "App", "https://github.com/anagrambuild/swig-wallet"),

  // Anchorage Digital
  entry("Anchorage Digital", "https://anchorage.com/insights/new-from-anchorage-golang-library-for-programmatic-tezos-interactions", "awsnitroverifier", "anchorage-awsnitroverifier", "Library", "https://github.com/anchorageoss/awsnitroverifier"),
  entry("Anchorage Digital", "https://anchorage.com/insights/new-from-anchorage-golang-library-for-programmatic-tezos-interactions", "tezosprotocol", "anchorage-tezosprotocol", "Library", "https://github.com/anchorageoss/tezosprotocol"),
  entry("Anchorage Digital", "https://anchorage.com/insights/new-from-anchorage-golang-library-for-programmatic-tezos-interactions", "visualsign-parser", "anchorage-visualsign-parser", "Library", "https://github.com/anchorageoss/visualsign-parser"),

  // AndrewInUA
  entry("AndrewInUA", "https://github.com/andrewinua", "solana-validator-metrics-html-widget", "andrewinua-validator-metrics-widget", "Dashboard", "https://github.com/andrewinua/solana-validator-metrics-html-widget"),
  entry("AndrewInUA", "https://github.com/andrewinua", "validator-transparency-dashboard", "andrewinua-validator-transparency-dashboard", "Dashboard", "https://github.com/andrewinua/validator-transparency-dashboard"),

  // Anza
  entry("Anza", "https://www.anza.xyz/", "Alpenglow", "anza-alpenglow", "Client", "https://github.com/anza-xyz/alpenglow"),
  entry("Anza", "https://www.anza.xyz/", "tpu-tools", "anza-tpu-tools", "Ops script", "https://github.com/anza-xyz/tpu-tools"),

  // Asymmetric Research
  entry("Asymmetric Research", "https://asymmetric.com/", "agent-coverage", "asymmetric-agent-coverage", "Ops script", "https://github.com/asymmetric-research/agent-coverage"),
  entry("Asymmetric Research", "https://asymmetric.com/", "crucible", "asymmetric-crucible", "Ops script", "https://github.com/asymmetric-research/crucible"),
  entry("Asymmetric Research", "https://asymmetric.com/", "solana-exporter", "asymmetric-solana-exporter", "Monitoring", "https://github.com/asymmetric-research/solana-exporter"),

  // Aursen
  entry("Aursen", "https://github.com/Aursen", "LiteSVM", "litesvm", "Library", "https://github.com/LiteSVM/litesvm"),
  entry("Aursen", "https://github.com/Aursen", "spume", "spume", "Library", "https://github.com/aursen-labs/spume"),
  entry("Aursen", "https://github.com/Aursen", "Typhoon", "typhoon", "Library", "https://github.com/aursen-labs/typhoon"),

  // Backpack
  entry("Backpack", "https://www.theblock.co/post/173345/security", "apr-ui", "coral-apr-ui", "Explorer", "https://github.com/coral-xyz/apr-ui"),
  entry("Backpack", "https://www.theblock.co/post/173345/security", "backpack", "coral-backpack", "App", "https://github.com/coral-xyz/backpack"),
  entry("Backpack", "https://www.theblock.co/post/173345/security", "sealevel-attacks", "coral-sealevel-attacks", "Library", "https://github.com/coral-xyz/sealevel-attacks"),

  // Bitget Wallet
  entry("Bitget Wallet", "https://github.com/bitgetwallet", "bkswapv2", "bitget-bkswapv2", "Library", "https://github.com/bitgetwallet/bkswapv2"),
  entry("Bitget Wallet", "https://github.com/bitgetwallet", "bwb-fliexible-staking-solana", "bitget-bwb-fliexible-staking-solana", "Library", "https://github.com/bitgetwallet/bwb-fliexible-staking-solana"),
  entry("Bitget Wallet", "https://github.com/bitgetwallet", "solana-swap", "bitget-solana-swap", "Library", "https://github.com/bitgetwallet/solana-swap"),

  // Block Logic
  entry("Block Logic", "https://www.blocklogic.net", "ping-thing-client", "ping-thing-client", "Monitoring", "https://github.com/Block-Logic/ping-thing-client"),
  entry("Block Logic", "https://www.blocklogic.net", "solana-rpc-api-compatibility-checker", "solana-rpc-api-compatibility-checker", "Ops script", "https://github.com/Block-Logic/solana-rpc-api-compatibility-checker"),

  // Blockdaemon
  entry("Blockdaemon", "https://github.com/Blockdaemon/agave-snapshot-gossip-client", "agave-snapshot-gossip-client", "blockdaemon-agave-snapshot-gossip-client", "Ops script", "https://github.com/Blockdaemon/agave-snapshot-gossip-client"),
  entry("Blockdaemon", "https://github.com/Blockdaemon/solana-accountsdb-plugin-kafka", "solana-accountsdb-plugin-kafka", "blockdaemon-solana-accountsdb-plugin-kafka", "Ops script", "https://github.com/Blockdaemon/solana-accountsdb-plugin-kafka"),
  entry("Blockdaemon", "https://github.com/Blockdaemon/solana-cluster", "solana-cluster", "blockdaemon-solana-cluster", "Ops script", "https://github.com/Blockdaemon/solana-cluster"),

  // bloXroute EU
  entry("bloXroute EU", "https://github.com/bloXroute-Labs/solana-trader-client-go", "solana-trader-client-go", "bloxroute-solana-trader-client-go", "Library", "https://github.com/bloXroute-Labs/solana-trader-client-go"),
  entry("bloXroute EU", "https://github.com/bloXroute-Labs/solana-trader-client-python", "solana-trader-client-python", "bloxroute-solana-trader-client-python", "Library", "https://github.com/bloXroute-Labs/solana-trader-client-python"),
  entry("bloXroute EU", "https://github.com/bloXroute-Labs/solana-trader-client-rust", "solana-trader-client-rust", "bloxroute-solana-trader-client-rust", "Library", "https://github.com/bloXroute-Labs/solana-trader-client-rust"),

  // blueshift
  entry("blueshift", "https://solanacompass.com/projects/blueshift", "program-sync", "blueshift-program-sync", "Ops script", "https://github.com/blueshift-gg/program-sync"),
  entry("blueshift", "https://solanacompass.com/projects/blueshift", "sbpf", "blueshift-sbpf", "Ops script", "https://github.com/blueshift-gg/sbpf"),
  entry("blueshift", "https://solanacompass.com/projects/blueshift", "Scilla", "blueshift-scilla", "Ops script", "https://github.com/blueshift-gg/Scilla"),

  // BrewlabsHQ
  entry("BrewlabsHQ", "https://www.brewlabs.so/", "brew-ops", "brewlabs-brew-ops", "Ops script", "https://github.com/brewlabshq/brew-ops"),
  entry("BrewlabsHQ", "https://www.brewlabs.so/", "fluence", "brewlabs-fluence", "Ops script", "https://github.com/brewlabshq/fluence"),
  entry("BrewlabsHQ", "https://www.brewlabs.so/", "valence", "brewlabs-valence", "Ops script", "https://github.com/brewlabshq/valence"),

  // BULK
  entry("BULK", "https://www.bulk.trade", "BULK Stats", "bulk-stats", "Dashboard", "https://bulkstats.com"),
  entry("BULK", "https://solanacompass.com/projects/bulk-trade", "bulk-client", "bulk-client", "Library", "https://github.com/bulk-trade/bulk-client"),
  entry("BULK", "https://solanacompass.com/projects/bulk-trade", "bulk-keychain", "bulk-keychain", "Library", "https://github.com/bulk-trade/bulk-keychain"),

  // Cavey Cool
  entry("Cavey Cool", "https://stake.quicknode.com/validators/CooLbbZy5Xmdt7DiHPQ3ss2uRXawnTXXVgpMS8E8jDzr", "sol (solana-cli-explorer)", "cavey-sol-terminal-explorer", "Explorer", "https://github.com/cavemanloverboy/sol"),
  entry("Cavey Cool", "https://stake.quicknode.com/validators/CooLbbZy5Xmdt7DiHPQ3ss2uRXawnTXXVgpMS8E8jDzr", "solana-nostd-entrypoint", "cavey-solana-nostd-entrypoint", "Library", "https://github.com/cavemanloverboy/solana-nostd-entrypoint"),
  entry("Cavey Cool", "https://stake.quicknode.com/validators/CooLbbZy5Xmdt7DiHPQ3ss2uRXawnTXXVgpMS8E8jDzr", "vanity", "cavey-vanity", "Ops script", "https://github.com/cavemanloverboy/vanity"),

  // Certora
  entry("Certora", "https://www.certora.com/blog/certora-joins-the-solana-foundation-delegation-program", "Certora Prover", "certora-prover", "Library", "https://github.com/Certora/CertoraProver"),
  entry("Certora", "https://www.certora.com/blog/certora-joins-the-solana-foundation-delegation-program", "solana-cvt", "certora-solana-cvt", "Library", "https://github.com/Certora/solana-cvt"),
  entry("Certora", "https://www.certora.com/blog/certora-joins-the-solana-foundation-delegation-program", "wala-solidity", "certora-wala-solidity", "Library", "https://github.com/Certora/wala-solidity"),

  // Cirro
  entry("Cirro", "https://cirro22.com", "LST Radar", "lst-radar", "Dashboard", "https://lstradar.com"),
  entry("Cirro", "https://sudofrens.io/", "SFDP Fren", "sfdp-fren", "Monitoring", "https://sudofrens.io"),

  // Cloak
  entry("Cloak", "https://github.com/cloak-ag", "cloak-perps", "cloak-perps", "Library", "https://github.com/cloak-ag/cloak-perps"),

  // Coinbase
  entry("Coinbase", "https://solanacompass.com/projects/coinbase-developer-platform", "AgentKit", "coinbase-agentkit", "Library", "https://github.com/coinbase/agentkit"),
  entry("Coinbase", "https://solanacompass.com/projects/coinbase-developer-platform", "CDP SDK", "coinbase-cdp-sdk", "Library", "https://github.com/coinbase/cdp-sdk"),

  // CryptoVik
  entry("CryptoVik", "https://cryptovik.info", "StakeMap", "stakemap", "Dashboard", "https://stakemap.info"),

  // Daiko
  entry("Daiko", "https://www.daiko.ai/", "marry.fun", "daiko-marry-fun", "App", "https://github.com/DaikoAI/marry-fun"),

  // DeepStake
  entry("DeepStake", "https://deepstake.info", "DeepStake Widget", "deepstake-widget", "App", "https://github.com/DeepStakeSol/deepstake-widget"),

  // DFlow
  entry("DFlow", "https://solanacompass.com/projects/dflow", "clearpools", "dflow-clearpools", "Library", "https://github.com/DFlowProtocol/clearpools"),
  entry("DFlow", "https://solanacompass.com/projects/dflow", "cookbook", "dflow-cookbook", "Library", "https://github.com/DFlowProtocol/cookbook"),
  entry("DFlow", "https://solanacompass.com/projects/dflow", "dflow-amm-interface", "dflow-amm-interface", "Library", "https://github.com/DFlowProtocol/dflow-amm-interface"),

  // diman
  entry("diman", "https://diman.io/", "raydium-cli-public", "diman-raydium-cli-public", "Ops script", "https://github.com/diman-io/raydium-cli-public"),
  entry("diman", "https://diman.io/", "solana-encrypt-keypair", "diman-solana-encrypt-keypair", "Ops script", "https://github.com/diman-io/solana-encrypt-keypair"),
  entry("diman", "https://diman.io/", "solana-keygen-py", "diman-solana-keygen-py", "Ops script", "https://github.com/diman-io/solana-keygen-py"),

  // Drift
  entry("Drift", "https://thedefiant.io/news/defi/drift-protocol-rebrands-to-velocity-dex-ahead-of-relaunch", "dlob-server", "drift-dlob-server", "Ops script", "https://github.com/velocity-exchange/dlob-server"),
  entry("Drift", "https://thedefiant.io/news/defi/drift-protocol-rebrands-to-velocity-dex-ahead-of-relaunch", "keeper-bots-v2", "drift-keeper-bots-v2", "Ops script", "https://github.com/velocity-exchange/keeper-bots-v2"),
  entry("Drift", "https://thedefiant.io/news/defi/drift-protocol-rebrands-to-velocity-dex-ahead-of-relaunch", "keepyrs", "drift-keepyrs", "Ops script", "https://github.com/velocity-exchange/keepyrs"),

  // DSRV
  entry("DSRV", "https://github.com/orgs/dsrvlabs/repositories", "kms-monorepo", "dsrv-kms-monorepo", "Library", "https://github.com/dsrvlabs/kms-monorepo"),
  entry("DSRV", "https://github.com/orgs/dsrvlabs/repositories", "vatz-plugin-solana", "dsrv-vatz-plugin-solana", "Monitoring", "https://github.com/dsrvlabs/vatz-plugin-solana"),

  // Edgevana
  entry("Edgevana", "https://github.com/edgevana", "firedancer-validator", "edgevana-firedancer-validator", "Ops script", "https://github.com/edgevana/firedancer-validator"),
  entry("Edgevana", "https://github.com/edgevana", "raid1-raid0-migration", "edgevana-raid1-raid0-migration", "Ops script", "https://github.com/edgevana/raid1-raid0-migration"),

  // ERPC
  entry("ERPC", "https://github.com/elsoul", "erpc-cli", "erpc-cli", "Ops script", "https://github.com/elsoul/erpc-cli"),
  entry("ERPC", "https://github.com/ValidatorsDAO", "solana-stream", "erpc-solana-stream", "Library", "https://github.com/ValidatorsDAO/solana-stream"),
  entry("ERPC", "https://github.com/ValidatorsDAO", "testing-tools", "erpc-testing-tools", "Ops script", "https://github.com/ValidatorsDAO/testing-tools"),

  // Everstake
  entry("Everstake", "https://github.com/everstake", "bip39", "everstake-bip39", "Ops script", "https://github.com/everstake/bip39"),
  entry("Everstake", "https://github.com/everstake", "Everstake Landing SWQoS examples", "everstake-swqos-docs", "Library", "https://github.com/everstake/everstake-swqos-docs"),
  entry("Everstake", "https://github.com/everstake", "Everstake Wallet SDK", "everstake-wallet-sdk", "Library", "https://github.com/everstake/wallet-sdk-docs"),

  // Exo Tech
  entry("Exo Tech", "https://solanacompass.com/projects/exo-technologies", "gov-v1", "exo-gov-v1", "Ops script", "https://github.com/exo-tech-xyz/gov-v1"),
  entry("Exo Tech", "https://solanacompass.com/projects/exo-technologies", "solana-program-crates", "exo-solana-program-crates", "Library", "https://github.com/exo-tech-xyz/solana-program-crates"),
  entry("Exo Tech", "https://solanacompass.com/projects/exo-technologies", "stake-deposit-interceptor", "exo-stake-deposit-interceptor", "Library", "https://github.com/exo-tech-xyz/stake-deposit-interceptor"),

  // Figment
  entry("Figment", "https://github.com/figment-networks", "figment-eth2-depositor", "figment-eth2-depositor", "Library", "https://github.com/figment-networks/figment-eth2-depositor"),
  entry("Figment", "https://github.com/figment-networks", "learn-solana-dapp", "figment-learn-solana-dapp", "App", "https://github.com/figment-networks/learn-solana-dapp"),

  // Firedancer Development
  entry("Firedancer Development", "https://github.com/firedancer-io/firedancer", "firedancer", "firedancer", "Client", "https://github.com/firedancer-io/firedancer"),
  entry("Firedancer Development", "https://github.com/firedancer-io/firedancer", "radiance", "firedancer-radiance", "Client", "https://github.com/firedancer-io/radiance"),
  entry("Firedancer Development", "https://github.com/firedancer-io/firedancer", "solana_dissector", "firedancer-solana-dissector", "Ops script", "https://github.com/firedancer-io/solana_dissector"),

  // Firstset
  entry("Firstset", "https://github.com/firstset", "fogo-community-ansible", "firstset-fogo-community-ansible", "Ops script", "https://github.com/firstset/fogo-community-ansible"),

  // GateOmega
  entry("GateOmega", "https://github.com/GateOmega", "Chunk-Production-Alert-Bot", "gateomega-chunk-production-alert-bot", "Monitoring", "https://github.com/GateOmega/Chunk-Production-Alert-Bot"),
  entry("GateOmega", "https://github.com/GateOmega", "Nearbackup", "gateomega-nearbackup", "Ops script", "https://github.com/GateOmega/Nearbackup"),
  entry("GateOmega", "https://github.com/GateOmega", "sui-node-alert", "gateomega-sui-node-alert", "Monitoring", "https://github.com/GateOmega/sui-node-alert"),

  // Ghost
  entry("Ghost", "https://tryghost.xyz", "Sandwiched.me", "ghost-sandwiched-me", "Dashboard", "https://sandwiched.me"),
  entry("Ghost", "https://tryghost.xyz", "solfi-sim", "ghost-solfi-sim", "Library", "https://github.com/datskos/solfi-sim"),

  // GooseFX
  entry("GooseFX", "https://github.com/GooseFX1/gfx-web-app", "gamma-swap", "goosefx-gamma-swap", "Library", "https://github.com/GooseFX1/gamma-swap"),
  entry("GooseFX", "https://github.com/GooseFX1/gfx-web-app", "gamma-swap-api", "goosefx-gamma-swap-api", "Library", "https://github.com/GooseFX1/gamma-swap-api"),
  entry("GooseFX", "https://github.com/GooseFX1/gfx-web-app", "gfx-web-app", "goosefx-gfx-web-app", "App", "https://github.com/GooseFX1/gfx-web-app"),

  // Grassets Tech
  entry("Grassets Tech", "https://grassets.tech", "grassets solana scripts", "grassets-solana-scripts", "Ops script", "https://github.com/grassets-tech/solana"),

  // Hanabi
  entry("Hanabi", "https://hanabi.so/staking-champions", "hanabi.so", "hanabi-so", "Dashboard", "https://hanabi.so"),

  // Haus
  entry("Haus", "https://www.nebula.haus/", "Alpha.haus", "haus-alpha-haus", "App", "https://alpha.haus/"),

  // Helius
  entry("Helius", "https://www.helius.dev/validator", "xray", "helius-xray", "Explorer", "https://github.com/helius-labs/xray"),

  // Hubra
  entry("Hubra", "https://hubra.app", "BlockRewardStream", "hubra-block-reward-stream", "Ops script", "https://github.com/Hubra-labs/BlockRewardStream"),
  entry("Hubra", "https://hubra.app", "staked.so", "hubra-staked-so", "Explorer", "https://github.com/Hubra-labs/staked.so"),
  entry("Hubra", "https://hubra.app", "t-apy", "hubra-t-apy", "Dashboard", "https://github.com/Hubra-labs/t-apy"),

  // Hylo
  entry("Hylo", "https://solanacompass.com/projects/hylo", "fix", "hylo-fix", "Library", "https://github.com/hylo-so/fix"),
  entry("Hylo", "https://solanacompass.com/projects/hylo", "Hylo Rust SDK", "hylo-sdk", "Library", "https://github.com/hylo-so/sdk"),
  entry("Hylo", "https://solanacompass.com/projects/hylo", "model", "hylo-model", "Library", "https://github.com/hylo-so/model"),

  // Iggyz
  entry("Iggyz", "https://iggyz.dog", "solana-program-rosetta", "iggyz-solana-program-rosetta", "Library", "https://github.com/joncinque/solana-program-rosetta"),

  // Jaguar
  entry("Jaguar", "https://jagpool.xyz", "JagPool stake pool app", "jagpool-stake-app", "App", "https://jagpool.xyz/stake"),
  entry("Jaguar", "https://jagpool.xyz", "JagPool Validators Map", "jagpool-validators-map", "Explorer", "https://jagpool.xyz/validators-map"),

  // Jito
  entry("Jito", "https://github.com/jito-foundation", "geyser-grpc-plugin", "jito-geyser-grpc-plugin", "Client", "https://github.com/jito-foundation/geyser-grpc-plugin"),
  entry("Jito", "https://github.com/jito-labs", "shredstream-proxy", "jito-shredstream-proxy", "Client", "https://github.com/jito-labs/shredstream-proxy"),

  // Jupiter
  entry("Jupiter", "https://docs.jup.ag/user-docs/earn/stake-sol/faq", "birdeye-cache-proxy", "jupiter-birdeye-cache-proxy", "Ops script", "https://github.com/jup-ag/birdeye-cache-proxy"),
  entry("Jupiter", "https://docs.jup.ag/user-docs/earn/stake-sol/faq", "yellowstone-grpc-swap-api-streaming", "jupiter-yellowstone-grpc-swap-api-streaming", "Ops script", "https://github.com/jup-ag/yellowstone-grpc-swap-api-streaming"),

  // Kevred
  entry("Kevred", "https://github.com/kevredlabs", "dz-pay-fees", "kevred-dz-pay-fees", "Ops script", "https://github.com/kevredlabs/dz-pay-fees"),
  entry("Kevred", "https://github.com/kevredlabs", "marinade-select-monitoring", "marinade-select-monitoring", "Monitoring", "https://github.com/kevredlabs/marinade-select-monitoring"),

  // Kiln
  entry("Kiln", "https://github.com/kilnfi", "sol-staking-widget", "kiln-sol-staking-widget", "Library", "https://github.com/kilnfi/sol-staking-widget"),
  entry("Kiln", "https://github.com/kilnfi", "solhint-rules", "kiln-solhint-rules", "Library", "https://github.com/kilnfi/solhint-rules"),

  // Kyzzen
  entry("Kyzzen", "https://www.kyzzen.io/", "Kyzzen", "kyzzen", "App", "https://www.kyzzen.io/"),

  // Laine (SOL Strategies)
  entry("Laine (SOL Strategies)", "https://stake.laine.one", "solana-validator-snapshot-keeper", "sol-strategies-snapshot-keeper", "Ops script", "https://github.com/SOL-Strategies/solana-validator-snapshot-keeper"),
  entry("Laine (SOL Strategies)", "https://stake.laine.one", "tvc-gov", "laine-tvc-gov", "Ops script", "https://github.com/laine-sa/tvc-gov"),

  // LI.FI
  entry("LI.FI", "https://li.fi/", "sdk", "lifi-sdk", "Library", "https://github.com/lifinance/sdk"),
  entry("LI.FI", "https://li.fi/", "solana-programs", "lifi-solana-programs", "Library", "https://github.com/lifinance/solana-programs"),
  entry("LI.FI", "https://li.fi/", "solstreams", "lifi-solstreams", "Library", "https://github.com/lifinance/solstreams"),

  // Lifinity Protocol
  entry("Lifinity Protocol", "https://github.com/Lifinity-Labs", "custom-oracle", "lifinity-custom-oracle", "Library", "https://github.com/Lifinity-Labs/custom-oracle"),
  entry("Lifinity Protocol", "https://github.com/Lifinity-Labs", "flare-staking", "lifinity-flare-staking", "App", "https://github.com/Lifinity-Labs/flare-staking"),

  // LimeChain
  entry("LimeChain", "https://github.com/LimeChain/zest", "sbpf-coverage", "limechain-sbpf-coverage", "Ops script", "https://github.com/LimeChain/sbpf-coverage"),
  entry("LimeChain", "https://github.com/LimeChain/zest", "Zest", "limechain-zest", "Ops script", "https://github.com/LimeChain/zest"),

  // LootGo
  entry("LootGo", "https://solanacompass.com/projects/lootgo", "LootGO mobile app", "lootgo-mobile-app", "App", "https://apps.apple.com/mo/app/lootgo/id6740266137"),

  // Lua Sol Foundation
  entry("Lua Sol Foundation", "https://luasol.io/", "BAM Subsidy Checker", "luasol-bam-subsidy-checker", "Dashboard", "https://luasol.io/tools#bam"),

  // Luganodes
  entry("Luganodes", "https://solanacompass.com/projects/luganodes", "Solana-Indexer", "luganodes-solana-indexer", "Library", "https://github.com/Luganodes/Solana-Indexer"),

  // LumLabs
  entry("LumLabs", "https://github.com/lumlabs", "dc-detect", "lumlabs-dc-detect", "Ops script", "https://github.com/lumlabs/dc-detect"),
  entry("LumLabs", "https://github.com/lumlabs", "dz-reward", "lumlabs-dz-reward", "Ops script", "https://github.com/lumlabs/dz-reward"),
  entry("LumLabs", "https://github.com/lumlabs", "solana_monitor_scripts", "lumlabs-solana-monitor-scripts", "Monitoring", "https://github.com/lumlabs/solana_monitor_scripts"),

  // LUX8
  entry("LUX8", "https://lux8.net", "LUX8 Wallet", "lux8-wallet", "App", "https://lux8.net/wallet/"),
  entry("LUX8", "https://lux8.net", "Stake Manager", "lux8-stake-manager", "Dashboard", "https://stake-manager.net"),

  // Magic Eden
  entry("Magic Eden", "https://github.com/orgs/me-foundation/repositories", "M2", "magiceden-m2", "Library", "https://github.com/me-foundation/m2"),
  entry("Magic Eden", "https://github.com/orgs/me-foundation/repositories", "MMM", "magiceden-mmm", "Library", "https://github.com/me-foundation/mmm"),
  entry("Magic Eden", "https://github.com/orgs/me-foundation/repositories", "Open Creator Protocol", "open-creator-protocol", "Library", "https://github.com/me-foundation/open_creator_protocol"),

  // mallow
  entry("mallow", "https://github.com/mallow-labs", "mallow-jellybean", "mallow-jellybean", "Library", "https://github.com/mallow-labs/mallow-jellybean"),
  entry("mallow", "https://github.com/mallow-labs", "mallow-wallet", "mallow-wallet", "App", "https://github.com/mallow-labs/mallow-wallet"),

  // MAS DeFi
  entry("MAS DeFi", "https://github.com/masdefi", "sol-mon", "masdefi-sol-mon", "Monitoring", "https://github.com/masdefi/sol-mon"),

  // Moonlet
  entry("Moonlet", "https://docs.moonlet.io/docs/getting-started/staking-dashboard", "Moonlet Staking Dashboard", "moonlet-staking-dashboard", "App", "https://stake.moonlet.io"),
  entry("Moonlet", "https://solana.com/ecosystem/moonletwallet", "Moonlet Wallet", "moonlet-wallet", "App", "https://apps.apple.com/app/moonlet/id1483013547"),

  // Nansen
  entry("Nansen", "https://github.com/nansen-ai", "solana-etl-table-definitions", "nansen-solana-etl-table-definitions", "Library", "https://github.com/nansen-ai/solana-etl-table-definitions"),

  // Neodyme
  entry("Neodyme", "https://github.com/neodyme-labs", "solana-nix", "neodyme-solana-nix", "Ops script", "https://github.com/neodyme-labs/solana-nix"),
  entry("Neodyme", "https://github.com/neodyme-labs", "solana-tx-signer", "neodyme-solana-tx-signer", "Ops script", "https://github.com/neodyme-labs/solana-tx-signer"),
  entry("Neodyme", "https://github.com/neodyme-labs", "validator-pcap-analysis", "neodyme-validator-pcap-analysis", "Ops script", "https://github.com/neodyme-labs/validator-pcap-analysis"),

  // Nodit
  entry("Nodit", "https://github.com/noditlabs", "nodit-mcp-server", "nodit-mcp-server", "Library", "https://github.com/noditlabs/nodit-mcp-server"),

  // Nova Consortium
  entry("Nova Consortium", "https://github.com/NovaConsortium", "Aegeon Status Monitoring", "nova-aegeon-status-monitoring", "Monitoring", "https://github.com/NovaConsortium/Aegeon-Status-Monitoring"),
  entry("Nova Consortium", "https://github.com/NovaConsortium", "bond-notifications-widget", "nova-bond-notifications-widget", "Monitoring", "https://github.com/NovaConsortium/bond-notifications-widget"),
  entry("Nova Consortium", "https://github.com/NovaConsortium", "Mercurion Slots Monitoring", "nova-mercurion-slots-monitoring", "Monitoring", "https://github.com/NovaConsortium/Mercurion-Slots-Monitoring"),

  // NuFi
  entry("NuFi", "https://nu.fi", "dapp-client", "nufi-dapp-client", "Library", "https://github.com/nufi-official/dapp-client"),
  entry("NuFi", "https://nu.fi", "NuFi wallet", "nufi-wallet", "App", "https://github.com/nufi-official/nufi"),
  entry("NuFi", "https://nu.fi", "nufi-snap", "nufi-snap", "App", "https://github.com/nufi-official/nufi-snap"),

  // Orangefin by SOL Strategies
  entry("Orangefin by SOL Strategies", "https://solanacompass.com/projects/sol-strategies", "doublezero-version-sync", "doublezero-version-sync", "Ops script", "https://github.com/sol-strategies/doublezero-version-sync"),
  entry("Orangefin by SOL Strategies", "https://solanacompass.com/projects/sol-strategies", "solana-validator-exporter", "sol-strategies-solana-validator-exporter", "Monitoring", "https://github.com/sol-strategies/solana-validator-exporter"),
  entry("Orangefin by SOL Strategies", "https://solanacompass.com/projects/sol-strategies", "stakewiz-frontend", "stakewiz-frontend", "Dashboard", "https://github.com/sol-strategies/stakewiz-frontend"),

  // Orca
  entry("Orca", "https://github.com/orca-so", "multisig-monitor", "orca-multisig-monitor", "Monitoring", "https://github.com/orca-so/multisig-monitor"),
  entry("Orca", "https://github.com/orca-so", "profitability-analysis", "orca-profitability-analysis", "Dashboard", "https://github.com/orca-so/profitability-analysis"),
  entry("Orca", "https://github.com/orca-so", "whirlpool-tx-replayer", "orca-whirlpool-tx-replayer", "Ops script", "https://github.com/orca-so/whirlpool-tx-replayer"),

  // OtterSec
  entry("OtterSec", "https://github.com/otter-sec", "Anchor", "ottersec-anchor", "Library", "https://github.com/otter-sec/anchor"),
  entry("OtterSec", "https://github.com/otter-sec", "solana-setup", "ottersec-solana-setup", "Ops script", "https://github.com/otter-sec/solana-setup"),
  entry("OtterSec", "https://github.com/otter-sec", "solana-verified-programs-api", "solana-verified-programs-api", "Ops script", "https://github.com/otter-sec/solana-verified-programs-api"),

  // Overclock
  entry("Overclock", "https://overclock.one/", "lightbringer", "overclock-lightbringer", "Ops script", "https://github.com/Overclock-Validator/lightbringer"),
  entry("Overclock", "https://overclock.one/", "shredcaster", "overclock-shredcaster", "Ops script", "https://github.com/Overclock-Validator/shredcaster"),

  // P2P.org
  entry("P2P.org", "https://p2p.org", "Key App Android", "p2p-key-app-android", "App", "https://github.com/p2p-org/key-app-android"),
  entry("P2P.org", "https://p2p.org", "P2P Wallet iOS", "p2p-wallet-ios", "App", "https://github.com/p2p-org/p2p-wallet-ios"),
  entry("P2P.org", "https://p2p.org", "solana-swift", "p2p-solana-swift", "Library", "https://github.com/p2p-org/solana-swift"),

  // Phantom
  entry("Phantom", "https://phantom.app", "deep-link-demo-app", "phantom-deep-link-demo-app", "App", "https://github.com/phantom/deep-link-demo-app"),
  entry("Phantom", "https://phantom.app", "phantom-connect-sdk", "phantom-connect-sdk", "Library", "https://github.com/phantom/phantom-connect-sdk"),
  entry("Phantom", "https://phantom.app", "sign-in-with-solana", "phantom-sign-in-with-solana", "Library", "https://github.com/phantom/sign-in-with-solana"),

  // Pine Analytics
  entry("Pine Analytics", "https://solanacompass.com/projects/pine-analytics", "Pine Analytics platform", "pine-analytics-platform", "Dashboard", "https://app.pineanalytics.xyz"),
  entry("Pine Analytics", "https://pinestake.com/", "Pine Stake Faucet", "pinestake-faucet", "App", "https://www.pinestake.com/faucet"),

  // Project 0
  entry("Project 0", "https://github.com/0dotxyz", "eva01", "p0-eva01", "Ops script", "https://github.com/0dotxyz/eva01"),
  entry("Project 0", "https://github.com/mrgnlabs/mrgn-ts", "funding-rate-arb", "mrgn-funding-rate-arb", "Ops script", "https://github.com/mrgnlabs/funding-rate-arb"),
  entry("Project 0", "https://github.com/mrgnlabs/mrgn-ts", "solana-dev-env", "mrgn-solana-dev-env", "Ops script", "https://github.com/mrgnlabs/solana-dev-env"),

  // Puffin
  entry("Puffin", "https://puffin-validator.xyz", "Alpenglow performance dashboard", "puffin-alpenglow-dashboard", "Dashboard", "https://puffin-validator.xyz/alpenglow"),
  entry("Puffin", "https://puffin-validator.xyz", "saas-payment", "puffin-saas-payment", "Ops script", "https://github.com/puffin-validator/saas-payment"),
  entry("Puffin", "https://puffin-validator.xyz", "solana-distance", "solana-distance", "Monitoring", "https://github.com/puffin-validator/solana-distance"),

  // Quicknode
  entry("Quicknode", "https://github.com/quiknode-labs/arcium-election", "arcium-election", "quicknode-arcium-election", "App", "https://github.com/quiknode-labs/arcium-election"),
  entry("Quicknode", "https://github.com/quiknode-labs/Solana-explorer", "Solana-explorer", "quicknode-solana-explorer", "Explorer", "https://github.com/quiknode-labs/Solana-explorer"),
  entry("Quicknode", "https://github.com/quiknode-labs/you-will-build-a-solana-program", "you-will-build-a-solana-program", "quicknode-you-will-build-a-solana-program", "App", "https://github.com/quiknode-labs/you-will-build-a-solana-program"),

  // Raiku
  entry("Raiku", "https://github.com/raiku-protocol", "RAIKU Revenue Simulator", "raiku-simulator", "Dashboard", "https://github.com/raiku-protocol/raiku-simulator"),
  entry("Raiku", "https://github.com/raiku-protocol", "raiku-programs", "raiku-programs", "Library", "https://github.com/raiku-protocol/raiku-programs"),
  entry("Raiku", "https://github.com/raiku-protocol", "solana-agave-version-updater", "raiku-solana-agave-version-updater", "Ops script", "https://github.com/raiku-protocol/solana-agave-version-updater"),

  // Rakurai
  entry("Rakurai", "https://github.com/rakurai-io", "rakurai-validator", "rakurai-validator", "Client", "https://github.com/rakurai-io/rakurai-validator"),
  entry("Rakurai", "https://github.com/rakurai-io", "rakurai_programs", "rakurai-programs", "Library", "https://github.com/rakurai-io/rakurai_programs"),

  // Range
  entry("Range", "https://github.com/rangesecurity", "faraday-privacy", "range-faraday-privacy", "Library", "https://github.com/rangesecurity/faraday-privacy"),
  entry("Range", "https://github.com/rangesecurity", "IDLGuesser", "idlguesser", "Ops script", "https://github.com/rangesecurity/IDLGuesser"),
  entry("Range", "https://github.com/rangesecurity", "solana-decoder", "range-solana-decoder", "Library", "https://github.com/rangesecurity/solana-decoder"),

  // Raydium
  entry("Raydium", "https://raydium.io", "pyth-publisher-dashboard", "raydium-pyth-publisher-dashboard", "Dashboard", "https://github.com/raydium-io/pyth-publisher-dashboard"),
  entry("Raydium", "https://raydium.io", "raydium-clmm", "raydium-clmm", "Library", "https://github.com/raydium-io/raydium-clmm"),
  entry("Raydium", "https://raydium.io", "raydium-sdk-v1", "raydium-sdk-v1", "Library", "https://github.com/raydium-io/raydium-sdk-v1"),

  // RevTec
  entry("RevTec", "https://revtec.fi", "RevTec app", "revtec-app", "App", "https://app.revtec.fi"),
  entry("RevTec", "https://revtec.fi", "RevTec Tools", "revtec-tools", "Dashboard", "https://tools.revtec.fi"),

  // Salmon Wallet
  entry("Salmon Wallet", "https://github.com/salmon-wallet/salmon-wallet-v2", "Salmon Wallet v2", "salmon-wallet-v2", "App", "https://github.com/salmon-wallet/salmon-wallet-v2"),

  // Sec3
  entry("Sec3", "https://github.com/sec3-product", "X-ray", "sec3-x-ray", "Ops script", "https://github.com/sec3-product/x-ray"),

  // Shinobi Systems
  entry("Shinobi Systems", "https://github.com/bji/vote-account-manager", "txingest-receiver", "shinobi-txingest-receiver", "Monitoring", "https://github.com/bji/txingest-receiver"),
  entry("Shinobi Systems", "https://github.com/bji/vote-account-manager", "Vote Account Manager", "shinobi-vote-account-manager", "Ops script", "https://github.com/bji/vote-account-manager"),

  // Solana Beach
  entry("Solana Beach", "https://solanabeach.io", "Solana Beach API", "solana-beach-api", "Library", "https://solanabeach.io/docs"),

  // Solana Compass
  entry("Solana Compass", "https://solanacompass.com/our-validator", "Solana Block Summary Explorer", "solana-compass-blocks", "Explorer", "https://solanacompass.com/blocks"),
  entry("Solana Compass", "https://solanacompass.com/our-validator", "Solana Decentralization Dashboard", "solana-compass-decentralization", "Dashboard", "https://solanacompass.com/statistics/decentralization"),

  // Solana Mobile
  entry("Solana Mobile", "https://solanamobile.com/", "dapp-publishing", "solana-mobile-dapp-publishing", "Library", "https://github.com/solana-mobile/dapp-publishing"),
  entry("Solana Mobile", "https://solanamobile.com/", "mobile-wallet-adapter", "solana-mobile-mobile-wallet-adapter", "Library", "https://github.com/solana-mobile/mobile-wallet-adapter"),
  entry("Solana Mobile", "https://solanamobile.com/", "seed-vault-sdk", "solana-mobile-seed-vault-sdk", "Library", "https://github.com/solana-mobile/seed-vault-sdk"),

  // Solana Vibe Station
  entry("Solana Vibe Station", "https://www.solanavibestation.com", "hydra", "svs-hydra", "Ops script", "https://github.com/Solana-Vibe-Station/hydra"),
  entry("Solana Vibe Station", "https://www.solanavibestation.com", "solana-rpc-performance-monitor", "svs-solana-rpc-performance-monitor", "Monitoring", "https://github.com/Solana-Vibe-Station/solana-rpc-performance-monitor"),
  entry("Solana Vibe Station", "https://www.solanavibestation.com", "solana-snapshot-auto-download", "svs-solana-snapshot-auto-download", "Ops script", "https://github.com/Solana-Vibe-Station/solana-snapshot-auto-download"),

  // Solayer
  entry("Solayer", "https://solayer.org", "Solayer Explorer", "solayer-explorer", "Explorer", "https://explorer.solayer.org"),
  entry("Solayer", "https://solayer.org", "solayer-cli", "solayer-cli", "Library", "https://github.com/solayer-labs/solayer-cli"),
  entry("Solayer", "https://solayer.org", "solayer-rpc", "solayer-rpc", "Client", "https://github.com/solayer-labs/solayer-rpc"),

  // SolBlaze
  entry("SolBlaze", "https://solanacompass.com/projects/solblaze", "BlazeRewards", "blazerewards", "App", "https://rewards.solblaze.org"),
  entry("SolBlaze", "https://solanacompass.com/projects/solblaze", "BlazeStake", "blazestake", "App", "https://stake.solblaze.org"),
  entry("SolBlaze", "https://solanacompass.com/projects/solblaze", "SolBlaze RPC Status", "solblaze-rpc-status", "Monitoring", "https://status.solblaze.org"),

  // Solend
  entry("Solend", "https://solend.fi", "liquidator", "solend-liquidator", "Ops script", "https://github.com/solendprotocol/liquidator"),
  entry("Solend", "https://solend.fi", "public", "solend-public", "App", "https://github.com/solendprotocol/public"),
  entry("Solend", "https://solend.fi", "tvl-calculator-example", "solend-tvl-calculator-example", "Ops script", "https://github.com/solendprotocol/tvl-calculator-example"),

  // Solflare
  entry("Solflare", "https://solflare.com", "blocklist-automation", "solflare-blocklist-automation", "Ops script", "https://github.com/solflare-wallet/blocklist-automation"),
  entry("Solflare", "https://solflare.com", "solflare-snap", "solflare-snap", "App", "https://github.com/solflare-wallet/solflare-snap"),
  entry("Solflare", "https://solflare.com", "utl-aggregator", "solflare-utl-aggregator", "Library", "https://github.com/solflare-wallet/utl-aggregator"),

  // Squads
  entry("Squads", "https://github.com/Squads-Protocol/v4", "Squads Multisig Program Library (squads-mpl)", "squads-mpl", "Library", "https://github.com/Squads-Protocol/squads-mpl"),
  entry("Squads", "https://github.com/Squads-Protocol/v4", "Squads Protocol v4", "squads-v4", "Library", "https://github.com/Squads-Protocol/v4"),
  entry("Squads", "https://github.com/Squads-Protocol/v4", "squads-cli", "squads-cli", "Ops script", "https://github.com/Squads-Protocol/squads-cli"),

  // Stakeconomy
  entry("Stakeconomy", "https://github.com/stakeconomy", "Solana Community Monitoring (solanamonitoring)", "stakeconomy-solanamonitoring", "Monitoring", "https://github.com/stakeconomy/solanamonitoring"),
  entry("Stakeconomy", "https://github.com/stakeconomy", "solana-install", "stakeconomy-solana-install", "Ops script", "https://github.com/stakeconomy/solana-install"),
  entry("Stakeconomy", "https://github.com/stakeconomy", "Stakeconomy community metrics dashboard", "stakeconomy-metrics-dashboard", "Dashboard", "https://metrics.stakeconomy.com"),

  // stakefish
  entry("stakefish", "https://github.com/stakefish", "crypto-laser-eyes", "stakefish-crypto-laser-eyes", "App", "https://github.com/stakefish/crypto-laser-eyes"),
  entry("stakefish", "https://github.com/stakefish", "stakefish-ui-legacy", "stakefish-ui-legacy", "Library", "https://github.com/stakefish/stakefish-ui-legacy"),
  entry("stakefish", "https://github.com/stakefish", "stanley-ipkiss", "stakefish-stanley-ipkiss", "App", "https://github.com/stakefish/stanley-ipkiss"),

  // Stakely
  entry("Stakely", "https://stakely.io", "lido-withdrawals-automation", "stakely-lido-withdrawals-automation", "Ops script", "https://github.com/Stakely/lido-withdrawals-automation"),
  entry("Stakely", "https://stakely.io", "stvaults-watcher", "stakely-stvaults-watcher", "Monitoring", "https://github.com/Stakely/stvaults-watcher"),
  entry("Stakely", "https://stakely.io", "twitter-to-telegram-bot", "stakely-twitter-to-telegram-bot", "Ops script", "https://github.com/Stakely/twitter-to-telegram-bot"),

  // Staker Space
  entry("Staker Space", "https://staker.space", "Staktics", "staker-space-staktics", "Dashboard", "https://staktics.staker.space"),

  // stakeware.xyz
  entry("stakeware.xyz", "https://stakeware.xyz", "Devnet Faucet", "stakeware-devnet-faucet", "App", "https://github.com/ferric-sol/devnetfaucet"),
  entry("stakeware.xyz", "https://stakeware.xyz", "Solana HCL", "solana-hcl", "Meta", "https://github.com/solanahcl/solanahcl"),
  entry("stakeware.xyz", "https://stakeware.xyz", "solanarpcmap", "stakeware-solana-rpc-map", "Dashboard", "https://github.com/ferric-sol/solanarpcmap"),

  // Staking Facilities
  entry("Staking Facilities", "https://solanacompass.com/projects/staking-facilities", "Solana Beach", "solana-beach", "Explorer", "https://solanabeach.io"),

  // Stardust
  entry("Stardust", "https://starduststaking.com/portfolio", "Near Staking", "stardust-near-staking", "Explorer", "https://near-staking.com"),
  entry("Stardust", "https://github.com/Stardust-Staking", "solana-tools", "stardust-solana-tools", "Ops script", "https://github.com/Stardust-Staking/solana-tools"),
  entry("Stardust", "https://github.com/Stardust-Staking", "sui-tools", "stardust-sui-tools", "Ops script", "https://github.com/Stardust-Staking/sui-tools"),

  // Starke Finance
  entry("Starke Finance", "https://starke.finance/tools", "Solana Staking Rewards Calculator", "starke-solana-staking-rewards-calculator", "App", "https://starke.finance/staking/solana-staking-rewards-calculator"),
  entry("Starke Finance", "https://starke.finance/tools", "Solana Staking Tax Calculator", "starke-solana-staking-tax-calculator", "App", "https://starke.finance/staking/solana-staking-tax-calculator"),
  entry("Starke Finance", "https://starke.finance/tools", "Solana Validator Profit Calculator", "starke-solana-validator-profit-calculator", "App", "https://starke.finance/validator/solana-validator-profit-calculator"),

  // Step Finance
  entry("Step Finance", "https://www.step.finance/", "reward-pool", "step-reward-pool", "Library", "https://github.com/step-finance/reward-pool"),
  entry("Step Finance", "https://www.step.finance/", "solana-market-aggregator", "step-solana-market-aggregator", "Library", "https://github.com/step-finance/solana-market-aggregator"),
  entry("Step Finance", "https://www.step.finance/", "step-staking", "step-staking", "Library", "https://github.com/step-finance/step-staking"),

  // Superteam Brazil
  entry("Superteam Brazil", "https://github.com/solanabr", "solana-stablecoin-standard", "superteam-br-solana-stablecoin-standard", "Library", "https://github.com/solanabr/solana-stablecoin-standard"),
  entry("Superteam Brazil", "https://github.com/solanabr", "solana-vault-standard", "superteam-br-solana-vault-standard", "Library", "https://github.com/solanabr/solana-vault-standard"),
  entry("Superteam Brazil", "https://github.com/solanabr", "superteam-academy", "superteam-br-superteam-academy", "App", "https://github.com/solanabr/superteam-academy"),

  // Syndica
  entry("Syndica", "https://syndica.io", "Sig", "sig", "Client", "https://github.com/Syndica/sig"),
  entry("Syndica", "https://syndica.io", "sig-fuzz", "sig-fuzz", "Ops script", "https://github.com/Syndica/sig-fuzz"),
  entry("Syndica", "https://syndica.io", "sig-svm", "sig-svm", "Client", "https://github.com/Syndica/sig-svm"),

  // Temporal
  entry("Temporal", "https://github.com/temporalxyz/delorean-client", "delorean-client", "temporal-delorean-client", "Ops script", "https://github.com/temporalxyz/delorean-client"),
  entry("Temporal", "https://temporal.xyz/services/nozomi", "Nozomi", "temporal-nozomi", "Ops script", "https://dashboard.nozomi.temporal.xyz"),
  entry("Temporal", "https://github.com/temporalxyz/solana-qos", "solana-qos", "temporal-solana-qos", "Ops script", "https://github.com/temporalxyz/solana-qos"),

  // Tinydancer
  entry("Tinydancer", "https://tinydancer.io", "diet-rpc-validator", "tinydancer-diet-rpc-validator", "Client", "https://github.com/tinydancer-io/diet-rpc-validator"),
  entry("Tinydancer", "https://tinydancer.io", "tinydancer", "tinydancer-light-client", "Client", "https://github.com/tinydancer-io/tinydancer"),
  entry("Tinydancer", "https://tinydancer.io", "xdp-redirect", "tinydancer-xdp-redirect", "Ops script", "https://github.com/tinydancer-io/xdp-redirect"),

  // Tokamai
  entry("Tokamai", "https://solanacompass.com/projects/tokamai", "Tokamai", "tokamai", "Monitoring", "https://app.tokamai.com"),

  // TruFin by Twinstake
  entry("TruFin by Twinstake", "https://github.com/TruFin-io", "smart-contracts-solana-public", "trufin-smart-contracts-solana", "Library", "https://github.com/TruFin-io/smart-contracts-solana-public"),

  // Trust Nodes
  entry("Trust Nodes", "https://github.com/trustwallet", "trust-connect-sdk", "trustwallet-trust-connect-sdk", "Library", "https://github.com/trustwallet/trust-connect-sdk"),
  entry("Trust Nodes", "https://github.com/trustwallet", "wallet-core", "trustwallet-wallet-core", "Library", "https://github.com/trustwallet/wallet-core"),

  // Vybe
  entry("Vybe", "https://solanacompass.com/projects/vybe-network", "Alpha Vybe", "vybe-alpha-vybe", "Dashboard", "https://vybe.fyi"),
  entry("Vybe", "https://solanacompass.com/projects/vybe-network", "solana-pyth-api", "vybe-solana-pyth-api", "Library", "https://github.com/vybenetwork/solana-pyth-api"),
  entry("Vybe", "https://solanacompass.com/projects/vybe-network", "solana-swap-api", "vybe-solana-swap-api", "Library", "https://github.com/vybenetwork/solana-swap-api"),

  // WEB34EVER
  entry("WEB34EVER", "https://web34ever.com", "marinade-SAM-monitor", "web34ever-marinade-sam-monitor", "Monitoring", "https://github.com/web3validator/marinade-SAM-monitor"),
  entry("WEB34EVER", "https://web34ever.com", "solana-hot-swap-operator-kit", "web34ever-solana-hot-swap-operator-kit", "Ops script", "https://github.com/web3validator/solana-hot-swap-operator-kit"),
  entry("WEB34EVER", "https://web34ever.com", "solana-release-alerts", "web34ever-solana-release-alerts", "Monitoring", "https://github.com/web3validator/solana-release-alerts"),

  // Windfall
  entry("Windfall", "https://lp.windfall.games/", "Windfall Portal", "windfall-portal", "App", "https://portal.windfall.games"),

  // Xandeum Labs
  entry("Xandeum Labs", "https://github.com/Xandeum", "Xandeum Explorer", "xandeum-explorer", "Explorer", "http://explorer.xandeum.com/"),
  entry("Xandeum Labs", "https://github.com/Xandeum", "xandeum-agave", "xandeum-agave", "Client", "https://github.com/Xandeum/xandeum-agave"),
  entry("Xandeum Labs", "https://github.com/Xandeum", "xandminer", "xandeum-xandminer", "App", "https://github.com/Xandeum/xandminer"),

  // Second pass (2026-10-14)
  entry("AiSol", "https://solanacompass.com/projects/aisol", "solana-monitoring", "ainodes-solana-monitoring", "Monitoring", "https://github.com/AiNodes-Tech/solana-monitoring"),
  entry("Block Parliament", "https://github.com/grod220/block-parliament", "block-parliament", "block-parliament", "Dashboard", "https://github.com/grod220/block-parliament"),
  entry("Huisky Staking", "https://github.com/huiskylabs/solana-validator-switch", "Solana Validator Switch (SVS)", "huisky-solana-validator-switch", "Ops script", "https://github.com/huiskylabs/solana-validator-switch"),
  entry("KAST", "https://solanacompass.com/projects/kast", "KAST app", "kast-app", "App", "https://kast.xyz"),
  entry("Tapedrive", "https://solanacompass.com/projects/tape-drive", "CrankX", "crankx", "Library", "https://github.com/tapedrive-io/crankx"),
  entry("Tapedrive", "https://solanacompass.com/projects/tape-drive", "Tapedrive (tape)", "tapedrive", "App", "https://github.com/tapedrive-io/tape"),
];

export const SEED_ADDED_BY = "seed";