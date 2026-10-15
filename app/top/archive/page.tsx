import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { monthLabel } from "@/lib/top";
import { listSnapshots } from "@/lib/top-queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMetadata({
  title: "Top builders archive",
  description: "The Top tool builders ranking of each past month, frozen on the first day of the next one.",
  path: "/top/archive",
});

export default async function ArchivePage() {
  const months = await listSnapshots();
  return (
    <>
      <p className="crumbs"><Link href="/top">Top builders</Link> / Archive</p>
      <h1 className="page-title">Top builders archive</h1>
      <section className="sec">
        {months.length === 0 ? (
          <p className="note">No month has been closed yet. The first snapshot is saved on the first day of next month.</p>
        ) : (
          <ul className="archive-list">
            {months.map((m) => (
              <li key={m.month} className="panel">
                <Link className="linkplain" href={`/top/${m.month}`}>{monthLabel(m.month)}</Link>
                {m.winner && <span className="vsub"> · #1 {m.winner.name}, {m.winner.toolCount} {m.winner.toolCount === 1 ? "tool" : "tools"}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
