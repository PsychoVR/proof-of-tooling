// UI data access. Backed by fixtures until the read API is wired in; pages only depend on these
// async functions and on the response types in lib/types.ts.
import { fixtureProfile, fixtureStats, fixtureTools, fixtureValidators } from "@/lib/fixtures";
import type {
  LeaderboardRow,
  RegistryResponse,
  Stats,
  ToolWithClaims,
  ValidatorProfile,
} from "@/lib/types";

// Fixture tools are listed in validator order and unclaimed tools carry no owner in the contract,
// so this mapping stands in for the API's validator-to-tool join.
const FIXTURE_OWNERS: Record<number, number> = { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 3, 7: 4, 8: 5 };
function ownerOf(toolId: number): string | undefined {
  return fixtureValidators[FIXTURE_OWNERS[toolId]]?.identity;
}

export async function getStats(): Promise<Stats> {
  return fixtureStats;
}

export async function getLeaderboardRows(): Promise<LeaderboardRow[]> {
  return fixtureValidators
    .map((validator) => {
      const tools = fixtureTools.filter((t) => ownerOf(t.id) === validator.identity);
      return {
        validator,
        toolCount: tools.length,
        claimedCount: tools.filter((t) => t.status === "claimed").length,
        tools: tools.map(({ id, slug, name, category, url }) => ({ id, slug, name, category, url })),
      };
    })
    .sort(
      (a, b) =>
        b.toolCount - a.toolCount || (a.validator.name ?? "").localeCompare(b.validator.name ?? ""),
    );
}

export async function getValidatorProfile(identity: string): Promise<ValidatorProfile | null> {
  const validator = fixtureValidators.find((v) => v.identity === identity);
  if (!validator) return null;
  if (identity === fixtureProfile.validator.identity) return fixtureProfile;
  return { validator, tools: fixtureTools.filter((t) => ownerOf(t.id) === identity), endorsements: [] };
}

export async function getTool(
  slug: string,
): Promise<{ tool: ToolWithClaims; users: { identity: string; name: string | null }[] } | null> {
  const tool = fixtureTools.find((t) => t.slug === slug);
  if (!tool) return null;
  const owner = fixtureValidators.find((v) => v.identity === ownerOf(tool.id));
  return { tool, users: owner ? [{ identity: owner.identity, name: owner.name }] : [] };
}

export async function getRegistry(): Promise<RegistryResponse> {
  return {
    generatedAt: fixtureStats.updatedAt,
    entries: fixtureTools.flatMap((t) =>
      t.claims.map((c) => ({
        tool: { url: t.url, name: t.name, category: t.category },
        identity: c.identity,
        cluster: c.cluster,
        message: c.message,
        signature: c.signature,
        status: c.status,
      })),
    ),
  };
}
