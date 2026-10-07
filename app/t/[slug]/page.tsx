import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/StatusPill";
import { UnclaimedBy } from "@/components/UnclaimedBy";
import { toolDisplayUrl } from "@/lib/claims/message";
import { getToolBySlug } from "@/lib/queries";
import { pageMetadata } from "@/lib/seo";
import { parseSlugParam } from "@/lib/ui/params";
import type { ToolWithClaims } from "@/lib/types";
import { formatDate, safeHttpUrl, shortKey, toolPillStatus } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** Validators tied to a tool: signed claimants first, otherwise the owner named by the seed entry. */
function usersOf(tool: ToolWithClaims): { identity: string | null; name: string | null; sourceUrl: string | null }[] {
  if (tool.claimedBy.length > 0) return tool.claimedBy.map((c) => ({ identity: c.identity, name: c.name, sourceUrl: null }));
  return tool.owner ? [{ identity: tool.owner.identity, name: tool.owner.name, sourceUrl: tool.owner.sourceUrl }] : [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = parseSlugParam((await params).slug);
  const tool = slug ? await getToolBySlug(slug) : null;
  if (!tool || !slug) return { title: "Tool not found", robots: { index: false } };
  const who =
    tool.status === "claimed"
      ? `Claimed by ${tool.claimedBy.length === 1 ? "a validator" : `${tool.claimedBy.length} validators`}`
      : tool.owner
        ? `Built by ${tool.owner.name} (unclaimed)`
        : "Unclaimed";
  return pageMetadata({
    title: tool.name,
    description: `${tool.name} is a ${tool.category.toLowerCase()} tool in the Proof of Tooling directory of tools built by Solana validators. ${who}.`,
    path: `/t/${slug}`,
  });
}

export default async function ToolPage({ params }: Props) {
  const slug = parseSlugParam((await params).slug);
  const tool = slug ? await getToolBySlug(slug) : null;
  if (!tool) notFound();
  const users = usersOf(tool);
  const href = safeHttpUrl(toolDisplayUrl(tool.url));

  return (
    <>
      <p className="crumbs"><Link href="/">Ledger</Link> / Tool</p>
      <h1 className="page-title" style={{ marginTop: 12 }}>{tool.name}</h1>
      <p style={{ margin: "8px 0 0" }}>
        <span className="tool"><span className="cat">{tool.category}</span></span>{" "}
        <StatusPill status={toolPillStatus(tool)} />
      </p>

      <div className="grid2" style={{ marginTop: 24 }}>
        <section className="panel" aria-labelledby="about-h">
          <h2 id="about-h" className="label" style={{ marginBottom: 12 }}>About</h2>
          <dl className="dl">
            <dt>Link</dt>
            <dd>{href ? <a className="linkplain" href={href} target="_blank" rel="noopener noreferrer nofollow">{tool.url}</a> : tool.url}</dd>
            <dt>Type</dt><dd>{tool.kind === "repo" ? "Repository" : "Website"}</dd>
            <dt>Original</dt><dd>{tool.isFork ? "Fork" : "Yes"}</dd>
            <dt>Added</dt><dd>{formatDate(tool.createdAt)}</dd>
          </dl>
        </section>
        <section className="panel" aria-labelledby="act-h">
          <h2 id="act-h" className="label" style={{ marginBottom: 12 }}>Activity</h2>
          <dl className="dl">
            <dt>Health</dt><dd><StatusPill status={tool.health} /></dd>
            <dt>Last commit</dt><dd>{formatDate(tool.lastCommitAt)}</dd>
            <dt>Stars</dt><dd>{tool.stars ?? "n/a"}</dd>
          </dl>
        </section>
      </div>

      <section className="sec" aria-labelledby="who-h">
        <div className="sec-head"><div><h2 id="who-h">Who uses it</h2></div></div>
        <div className="panel">
          {users.length === 0 ? (
            <span style={{ color: "var(--muted)" }}>No validators listed yet.</span>
          ) : (
            <ul className="list">
              {users.map((u) => (
                <li key={u.identity ?? u.name}>
                  {u.identity ? (
                    <Link className="linkplain" href={`/v/${encodeURIComponent(u.identity)}`}>
                      {u.name?.trim() || shortKey(u.identity)}
                    </Link>
                  ) : null}
                  {u.identity ? (
                    <span className="vsub mono" title={u.identity}>{shortKey(u.identity)}</span>
                  ) : null}
                  {u.identity ? <StatusPill status={toolPillStatus(tool, u.identity)} /> : <UnclaimedBy name={u.name} sourceUrl={u.sourceUrl} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
