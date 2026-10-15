import type { Metadata } from "next";
import Link from "next/link";
import { NewThisMonth, TopBuilders, TopComingSoon } from "@/components/TopBuilders";
import { pageMetadata } from "@/lib/seo";
import { getNewThisMonth, getTopBoard, listSnapshots } from "@/lib/top-queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMetadata({
  title: "Top builders",
  description: "Solana validators ranked by the tools they have signed with their identity key. Unclaimed tools do not count.",
  path: "/top",
});

export default async function TopPage() {
  const [top, fresh, months] = await Promise.all([getTopBoard(), getNewThisMonth(), listSnapshots()]);
  return (
    <>
      <h1 className="page-title">Top builders</h1>
      <section className="sec" aria-labelledby="top-board-h">
        <div className="sec-head">
          <div>
            <h2 id="top-board-h">Ranking</h2>
            <p>Validators ranked by signed tools. Ties go to whoever signed first.</p>
          </div>
          {months.length > 0 && <Link className="linkplain" href="/top/archive">Previous months</Link>}
        </div>
        {top.visible ? <TopBuilders entries={top.entries} /> : <TopComingSoon />}
      </section>
      {fresh.length > 0 && (
        <section className="sec" aria-labelledby="new-h">
          <div className="sec-head">
            <h2 id="new-h">New this month</h2>
          </div>
          <NewThisMonth items={fresh} />
        </section>
      )}
    </>
  );
}
