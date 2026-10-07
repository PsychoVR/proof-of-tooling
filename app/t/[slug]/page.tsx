import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/StatusPill";
import { getTool } from "@/lib/ui/data";
import { formatDate, safeHttpUrl, shortKey } from "@/lib/ui/format";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await getTool(decodeURIComponent(slug));
  return { title: found ? found.tool.name : "Tool not found" };
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const found = await getTool(decodeURIComponent(slug));
  if (!found) notFound();
  const { tool, users } = found;
  const href = safeHttpUrl(tool.url);

  return (
    <>
      <p className="crumbs"><Link href="/">Ledger</Link> / Tool</p>
      <h1 className="page-title" style={{ marginTop: 12 }}>{tool.name}</h1>
      <p style={{ margin: "8px 0 0" }}>
        <span className="tool"><span className="cat">{tool.category}</span></span>{" "}
        <StatusPill status={tool.status} />
      </p>

      <div className="grid2" style={{ marginTop: 24 }}>
        <section className="panel" aria-labelledby="about-h">
          <h2 id="about-h" className="label" style={{ marginBottom: 12 }}>About</h2>
          <dl className="dl">
            <dt>Link</dt>
            <dd>{href ? <a className="linkplain" href={href} target="_blank" rel="noopener noreferrer nofollow">{tool.url.replace(/^https?:\/\//, "")}</a> : tool.url}</dd>
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
                <li key={u.identity}>
                  <Link className="linkplain" href={`/v/${encodeURIComponent(u.identity)}`}>
                    {u.name?.trim() || shortKey(u.identity)}
                  </Link>
                  <StatusPill status={tool.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
