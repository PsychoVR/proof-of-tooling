import type { Metadata } from "next";
import { ClaimWizard } from "@/components/ClaimWizard";

export const metadata: Metadata = { title: "Claim a tool" };

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
