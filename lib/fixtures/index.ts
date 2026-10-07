import { normalizeToolUrl } from "@/lib/claims/message";
import type { Category, Claim, Stats, ToolWithClaims, Validator, ValidatorProfile } from "@/lib/types";

const NOW = "2026-10-07T12:00:00.000Z";

// Example data only: identities and signatures are placeholders, not real keys.
const v = (n: number, name: string, website: string, stake: string): Validator => ({
  identity: `ExampleIdentity${n}`.padEnd(44, "1"),
  cluster: "mainnet",
  voteAccount: `ExampleVote${n}`.padEnd(44, "1"),
  name,
  website: `https://${website}`,
  iconUrl: null,
  activatedStake: stake,
  version: "3.0.0",
  delinquent: false,
  updatedAt: NOW,
});

export const fixtureValidators: Validator[] = [
  v(1, "Pumpkin's Pool", "pumpkinspool.com", "900000000000000"),
  v(2, "Valid Blocks", "validblocks.com", "700000000000000"),
  v(3, "Overclock", "overclock.one", "500000000000000"),
  v(4, "Laine", "stakewiz.com", "400000000000000"),
  v(5, "Block Logic", "validators.app", "300000000000000"),
  { ...v(6, "SunshineVR", "sunshinevr.io", "10000000000000"), cluster: "alpenglow" },
];

let toolId = 0;
const t = (
  name: string,
  category: Category,
  url: string,
  owner: Validator,
  signed = false,
): ToolWithClaims => {
  const id = ++toolId;
  const canonical = normalizeToolUrl(url);
  const claims: Claim[] = signed
    ? [
        {
          id,
          toolId: id,
          identity: owner.identity,
          cluster: owner.cluster,
          message: `proof-of-tooling v1 | claim | ${canonical} | ${owner.identity} | 2026-10-06`,
          signature: "ExampleSignature".padEnd(88, "1"),
          signedDate: "2026-10-06",
          status: "active",
          verifiedAt: NOW,
          lastCheckedAt: NOW,
        },
      ]
    : [];
  return {
    id,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    url: canonical,
    name,
    category,
    kind: canonical.startsWith("github.com/") ? "repo" : "web",
    isFork: false,
    stars: canonical.startsWith("github.com/") ? 120 : null,
    lastCommitAt: canonical.startsWith("github.com/") ? NOW : null,
    health: "active",
    createdAt: NOW,
    status: signed ? "claimed" : "unclaimed",
    owner: { name: owner.name ?? owner.identity, identity: signed ? owner.identity : null },
    claims,
    claimedBy: signed ? [{ identity: owner.identity, cluster: owner.cluster, name: owner.name }] : [],
  };
};

const [pumpkin, validblocks, overclock, laine, blocklogic, sunshine] = fixtureValidators;

export const fixtureTools: ToolWithClaims[] = [
  t("Watchtower", "Monitoring", "https://pumpkinspool.com/watchtower", pumpkin),
  t("RugAlert", "Monitoring", "https://pumpkinspool.com/watchtower/rugs", pumpkin),
  t("Alpenglow Explorer", "Explorer", "https://ag.validblocks.com", validblocks),
  t("Solana Dashboards", "Dashboard", "https://dashboards.validblocks.com", validblocks),
  t("Mithril", "Client", "https://github.com/Overclock-Validator/mithril", overclock),
  t("Stakewiz", "Explorer", "https://stakewiz.com", laine),
  t("validators.app", "Explorer", "https://www.validators.app", blocklogic),
  t("Proof of Tooling", "Meta", "https://github.com/sunshinevr/proof-of-tooling", sunshine, true),
];

export const fixtureStats: Stats = {
  toolsTotal: fixtureTools.length,
  toolsClaimed: fixtureTools.filter((x) => x.status === "claimed").length,
  toolsUnclaimed: fixtureTools.filter((x) => x.status === "unclaimed").length,
  validatorsWithTools: fixtureValidators.length,
  validatorsTotal: fixtureValidators.length,
  byCategory: {
    Monitoring: 2,
    Explorer: 3,
    Dashboard: 1,
    Client: 1,
    "Ops script": 0,
    Library: 0,
    Meta: 1,
  },
  updatedAt: NOW,
};

export const fixtureProfile: ValidatorProfile = {
  validator: sunshine,
  tools: fixtureTools.filter((x) => x.claimedBy.some((c) => c.identity === sunshine.identity)),
  endorsements: [],
};
