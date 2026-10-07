import type { Metadata } from "next";
import { ClaimWizard } from "@/components/ClaimWizard";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Claim a tool",
  description:
    "Prove you built a tool: sign one line with your validator identity using the Solana CLI and add a proof file to the repo or site. Your keypair never leaves your machine.",
  path: "/claim",
});

export default function ClaimPage() {
  return (
    <>
      <h1 className="page-title">Claim a tool</h1>
      <p className="lede" style={{ marginTop: 8 }}>
        Sign one line with your validator identity key. Three steps, and the keypair never leaves your machine.
      </p>
      <ClaimWizard />
    </>
  );
}
