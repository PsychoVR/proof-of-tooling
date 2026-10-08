import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CodeBlock } from "@/components/CodeBlock";
import { PoolBadges, SfdpBadge } from "@/components/PoolBadge";
import { StatusPill } from "@/components/StatusPill";
import { ToolChip } from "@/components/ToolChip";
import { getValidatorProfile } from "@/lib/queries";
import { pageMetadata } from "@/lib/seo";
import { parseIdentityParam } from "@/lib/ui/params";
import { MULTI_CLUSTER } from "@/lib/clusters";
import { CLUSTER_LABEL, displayName, formatDate, formatStake, safeHttpUrl, shortKey, toolPillStatus } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ identity: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseIdentityParam((await params).identity);
  const profile = id ? await getValidatorProfile(id) : null;
  if (!profile || !id) return { title: "Validator not found", robots: { index: false } };
  const name = displayName(profile.validator);
  const signed = profile.tools.filter((t) => t.claimedBy.some((c) => c.identity === id)).length;
  return pageMetadata({
    title: name,
    description: `${name} on Proof of Tooling: ${signed === 0 ? "no signed tools yet" : `${signed} ${signed === 1 ? "tool" : "tools"} signed with its validator identity`}.`,
    path: `/v/${id}`,
  });
}

export default async function ValidatorPage({ params }: Props) {
  const id = parseIdentityParam((await params).identity);
  const profile = id ? await getValidatorProfile(id) : null; // not a public key: 404 without touching the database
  if (!profile) notFound();
  const { validator: v, tools, endorsements, pools, sfdp } = profile;
  const hasBadges = (pools?.length ?? 0) > 0 || sfdp?.participant === true;
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
          <span className="vsub mono" title={v.identity}>{shortKey(v.identity)}</span>{" "}
          {MULTI_CLUSTER && <span className="cluster-tag">{CLUSTER_LABEL[v.cluster]}</span>}{" "}
          {v.delinquent && <span className="status withdrawn">Delinquent</span>}
        </div>
      </div>

      {hasBadges && (
        <section className="pool-section" aria-label="Stake pools and programs">
          {(pools?.length ?? 0) > 0 && <h2 className="label">Stake pools</h2>}
          <div className="pool-row">
            <PoolBadges pools={pools} chip />
            <SfdpBadge participant={sfdp?.participant} />
          </div>
        </section>
      )}

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
                  <StatusPill status={toolPillStatus(t, v.identity)} />
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
