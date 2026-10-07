import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CodeBlock } from "@/components/CodeBlock";
import { StatusPill } from "@/components/StatusPill";
import { ToolChip } from "@/components/ToolChip";
import { getValidatorProfile } from "@/lib/queries";
import { CLUSTER_LABEL, displayName, formatDate, formatStake, safeHttpUrl } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ identity: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { identity } = await params;
  const profile = await getValidatorProfile(decodeURIComponent(identity));
  return { title: profile ? displayName(profile.validator) : "Validator not found" };
}

export default async function ValidatorPage({ params }: Props) {
  const { identity } = await params;
  const profile = await getValidatorProfile(decodeURIComponent(identity));
  if (!profile) notFound();
  const { validator: v, tools, endorsements } = profile;
  const name = displayName(v);
  const site = safeHttpUrl(v.website);
  const badge = `[![Proof of Tooling](https://tooling.sunshinevr.io/badge/${v.identity}.svg)](https://tooling.sunshinevr.io/v/${v.identity})`;

  return (
    <>
      <p className="crumbs"><Link href="/">Ledger</Link> / Validator</p>
      <div className="detail-head">
        <Avatar name={name} iconUrl={v.iconUrl} large />
        <div>
          <h1 className="page-title" style={{ marginTop: 0 }}>{name}</h1>
          <span className="cluster-tag">{CLUSTER_LABEL[v.cluster]}</span>{" "}
          {v.delinquent && <span className="status withdrawn">Delinquent</span>}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 24 }}>
        <section className="panel" aria-labelledby="net-h">
          <h2 id="net-h" className="label" style={{ marginBottom: 12 }}>Network data</h2>
          <dl className="dl">
            <dt>Identity</dt><dd className="mono">{v.identity}</dd>
            <dt>Vote account</dt><dd className="mono">{v.voteAccount}</dd>
            <dt>Active stake</dt><dd>{formatStake(v.activatedStake)}</dd>
            <dt>Version</dt><dd>{v.version ?? "n/a"}</dd>
            <dt>Website</dt>
            <dd>{site ? <a className="linkplain" href={site} target="_blank" rel="noopener noreferrer nofollow">{new URL(site).host}</a> : "n/a"}</dd>
            <dt>Updated</dt><dd>{formatDate(v.updatedAt)}</dd>
          </dl>
        </section>

        <section className="panel" aria-labelledby="badge-h">
          <h2 id="badge-h" className="label" style={{ marginBottom: 12 }}>Badge</h2>
          <div className="stackv">
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
              Embeddable badge for your site or README. Badges go live in the next phase; the snippet is final.
            </p>
            <CodeBlock text={badge} />
          </div>
        </section>
      </div>

      <section className="sec" aria-labelledby="tools-h">
        <div className="sec-head"><div><h2 id="tools-h">Tools</h2></div></div>
        {tools.length === 0 ? (
          <div className="panel empty">
            <p style={{ margin: "0 0 12px" }}>No tools listed for this validator yet.</p>
            <Link className="btn primary" href="/claim">Claim your first tool</Link>
          </div>
        ) : (
          <div className="panel">
            <ul className="list">
              {tools.map((t) => (
                <li key={t.id}>
                  <ToolChip tool={t} />
                  <StatusPill status={t.status} />
                  <span className="vsub">{t.url}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="sec" aria-labelledby="end-h">
        <div className="sec-head"><div><h2 id="end-h">Endorsements</h2></div></div>
        <div className="panel">
          {endorsements.length === 0 ? (
            <span style={{ color: "var(--muted)" }}>No endorsements yet.</span>
          ) : (
            <ul className="list">
              {endorsements.map((e) => (
                <li key={e.id} className="mono">{e.identity} · {formatDate(e.createdAt)}</li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
