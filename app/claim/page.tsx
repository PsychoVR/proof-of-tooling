import type { Metadata } from "next";
import { ClaimWizard } from "@/components/ClaimWizard";
import { pageMetadata } from "@/lib/seo";
import { getToolByUrl } from "@/lib/queries";
import { parseClaimPrefill } from "@/lib/ui/claim";
import type { ToolWithClaims } from "@/lib/types";

export const metadata: Metadata = pageMetadata({
  title: "Claim a tool",
  description:
    "Prove you built a tool: sign one line with your validator identity using the Solana CLI and add a proof file to the repo or site. Your keypair never leaves your machine.",
  path: "/claim",
});

export default async function ClaimPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let initial = parseClaimPrefill(await searchParams);
  // A url that is already listed takes its name and category from the directory, not from the link.
  let listed: ToolWithClaims | null = null;
  if (initial.url) {
    listed = await getToolByUrl(initial.url).catch(() => null);
    if (listed) initial = { ...initial, name: listed.name, category: listed.category };
  }
  return (
    <>
      <h1 className="page-title">Claim a tool</h1>
      <p className="lede" style={{ marginTop: 8 }}>
        Sign one line with your validator identity key. Three steps, and the keypair never leaves your machine.
      </p>
      <ClaimWizard
        initial={initial}
        listed={listed ? { slug: listed.slug, claimed: listed.status === "claimed", creditedTo: listed.owner?.name ?? null } : undefined}
      />
    </>
  );
}
