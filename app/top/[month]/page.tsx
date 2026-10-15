import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBuilders } from "@/components/TopBuilders";
import { OG_IMAGE, pageMetadata, SITE_NAME } from "@/lib/seo";
import { isMonthParam, monthLabel } from "@/lib/top";
import { getSnapshot } from "@/lib/top-queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ month: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const month = (await params).month;
  const snap = isMonthParam(month) ? await getSnapshot(month) : null;
  if (!snap) return { title: "Snapshot not found", robots: { index: false } };
  const title = `Top tool builders · ${monthLabel(month)}`;
  const image = { ...OG_IMAGE, url: `/top/${month}/og.png`, height: 675, alt: `${title}. ${SITE_NAME}` };
  const base = pageMetadata({ title, description: `The Top tool builders ranking of ${monthLabel(month)}, frozen on the first day of the next month.`, path: `/top/${month}` });
  return {
    ...base,
    openGraph: { ...base.openGraph, images: [image] },
    twitter: { ...base.twitter, images: [{ url: image.url, alt: image.alt }] },
  };
}

export default async function SnapshotPage({ params }: Props) {
  const month = (await params).month;
  const snap = isMonthParam(month) ? await getSnapshot(month) : null;
  if (!snap) notFound();
  const label = monthLabel(month);
  return (
    <>
      <p className="crumbs"><Link href="/top">Top builders</Link> / <Link href="/top/archive">Archive</Link> / {label}</p>
      <h1 className="page-title">Top tool builders · {label}</h1>
      <section className="sec" aria-label={`Ranking of ${label}`}>
        <p className="note" style={{ marginBottom: 12 }}>Frozen on the first day of the next month. Later claims do not change it.</p>
        <TopBuilders entries={snap.entries} period={label} />
      </section>
    </>
  );
}
