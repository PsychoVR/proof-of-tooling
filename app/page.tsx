import Link from "next/link";
import { CategoryBars } from "@/components/CategoryBars";
import { KpiStrip } from "@/components/KpiStrip";
import { Leaderboard } from "@/components/Leaderboard";
import { Odometer } from "@/components/Odometer";
import { StatusStack } from "@/components/StatusStack";
import type { Metadata } from "next";
import { getLeaderboard, getStats, getTools } from "@/lib/queries";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ path: "/" });
export const dynamic = "force-dynamic";

export default async function Home() {
  const [stats, board, unclaimed] = await Promise.all([
    getStats(),
    getLeaderboard({ pageSize: 100 }),
    getTools({ status: "unclaimed" }),
  ]);
  const rows = board.items;
  return (
    <>
      <section className="hero">
        <div className="panel counter-panel">
          <span className="label">Running total</span>
          <Odometer value={stats.toolsTotal} />
          <h1>A tool that counts the tools validators build. Including this one.</h1>
          <p className="lede">
            Explorers, monitors, dashboards, clients, scripts. Validators who ship public goods sign a claim with
            their identity key, and the count goes up.
          </p>
          <KpiStrip stats={stats} />
        </div>
        <div className="panel meter">
          <h2>What validators build</h2>
          <p className="sub">Tools in the ledger, by category</p>
          <CategoryBars byCategory={stats.byCategory} />
          <StatusStack claimed={stats.toolsClaimed} unclaimed={stats.toolsUnclaimed} />
        </div>
      </section>

      <Leaderboard rows={rows} unclaimed={unclaimed} />

      <section className="sec" aria-labelledby="how-h">
        <div className="sec-head">
          <div>
            <h2 id="how-h">How it works</h2>
          </div>
        </div>
        <div className="how">
          <div className="panel">
            <span className="label">Proof</span>
            <h3>Signed by the identity key</h3>
            <p>
              The claim is a Solana off-chain message signed with the key that runs the validator. Nobody can list a
              tool under someone else&apos;s name.
            </p>
          </div>
          <div className="panel">
            <span className="label">Registry</span>
            <h3>One public file, re-checkable by anyone</h3>
            <p>
              Every signature lands in the <Link className="linkplain" href="/registry">public registry</Link>, so
              anyone can verify it again.
            </p>
          </div>
          <div className="panel">
            <span className="label">Fair count</span>
            <h3>Forks don&apos;t count</h3>
            <p>
              Only original, public repos or live sites with real commits. One tool per repo, no matter how many
              clusters you run it on. <Link className="linkplain" href="/claim">Claim yours</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
