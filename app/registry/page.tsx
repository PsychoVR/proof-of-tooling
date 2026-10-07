import type { Metadata } from "next";
import Link from "next/link";
import { MULTI_CLUSTER } from "@/lib/clusters";
import { getRegistry } from "@/lib/queries";
import { pageMetadata } from "@/lib/seo";
import { shortKey } from "@/lib/ui/format";

export const metadata: Metadata = pageMetadata({
  title: "Registry",
  description:
    "Every verified claim in one downloadable file, with its message and signature, so anyone can re-verify it without trusting this site.",
  path: "/registry",
});
export const dynamic = "force-dynamic";

export default async function RegistryPage() {
  const registry = await getRegistry();
  return (
    <>
      <h1 className="page-title">Registry</h1>
      <p className="lede" style={{ marginTop: 8 }}>
        Every verified claim is published with its message and signature. Anyone can re-verify them without
        trusting this site.
      </p>
      <div className="btns" style={{ marginTop: 16 }}>
        <a className="btn primary" href="/registry.json" download>
          Download registry.json
        </a>
        <Link className="btn" href="/claim">
          Add your claim
        </Link>
      </div>

      <section className="sec" aria-labelledby="re-h">
        <div className="sec-head">
          <div>
            <h2 id="re-h">How to re-verify</h2>
          </div>
        </div>
        <div className="how">
          <div className="panel">
            <span className="label">1</span>
            <h3>Read an entry</h3>
            <p>Each entry holds the tool, the identity, the exact message and the base58 signature.</p>
          </div>
          <div className="panel">
            <span className="label">2</span>
            <h3>Wrap the message</h3>
            <p>Serialize the message as a Solana off-chain message (version 0) before checking.</p>
          </div>
          <div className="panel">
            <span className="label">3</span>
            <h3>Check Ed25519</h3>
            <p>Verify the signature against the identity public key. If it passes, the claim is genuine.</p>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="en-h">
        <div className="sec-head">
          <div>
            <h2 id="en-h">Entries</h2>
            <p>{registry.entries.length} signed {registry.entries.length === 1 ? "claim" : "claims"} in this preview.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Tool</th>
                <th scope="col">Identity</th>
                {MULTI_CLUSTER && <th scope="col">Cluster</th>}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {registry.entries.length === 0 ? (
                <tr><td colSpan={4} className="empty">No signed claims yet.</td></tr>
              ) : (
                registry.entries.map((e) => (
                  <tr key={`${e.identity}:${e.tool.url}`}>
                    <td>{e.tool.name} <span className="vsub">{e.tool.url}</span></td>
                    <td className="mono">{shortKey(e.identity, 8, 6)}</td>
                    {MULTI_CLUSTER && <td>{e.cluster}</td>}
                    <td className="mono">{e.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
