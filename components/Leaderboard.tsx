"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ENABLED_CLUSTERS, MULTI_CLUSTER } from "@/lib/clusters";
import { CATEGORIES, type Category, type Cluster, type LeaderboardRow, type ToolWithClaims } from "@/lib/types";
import { claimLink } from "@/lib/ui/claim";
import { CLUSTER_LABEL, displayName, safeHttpUrl, shortKey } from "@/lib/ui/format";
import { Avatar } from "./Avatar";
import { PoolBadges, SfdpBadge } from "./PoolBadge";
import { StatusPill } from "./StatusPill";
import { UnclaimedBy } from "./UnclaimedBy";
import { ToolChip } from "./ToolChip";

type StatusFilter = "all" | "claimed" | "unclaimed";

function Seg<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function rowStatus(r: LeaderboardRow): "claimed" | "stale" {
  return r.tools.some((t) => t.status === "signed") ? "claimed" : "stale";
}

/**
 * Signed validators ranked by tools, plus a separate list of unclaimed tools. Unclaimed tools show who
 * built them as plain text: they are never linked to a validator profile or counted in its ranking.
 */
export function Leaderboard({ rows, unclaimed }: { rows: LeaderboardRow[]; unclaimed: ToolWithClaims[] }) {
  const [cluster, setCluster] = useState<Cluster | "all">("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (cluster !== "all" && r.validator.cluster !== cluster) return false;
      if (category !== "all" && !r.tools.some((t) => t.category === category)) return false;
      if (!q) return true;
      const hay = [r.validator.name ?? "", r.validator.identity, ...r.tools.map((t) => t.name)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, cluster, category, query]);

  const visibleUnclaimed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return unclaimed.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      return !q || `${t.name} ${t.owner?.name ?? ""}`.toLowerCase().includes(q);
    });
  }, [unclaimed, category, query]);
  const showSigned = status !== "unclaimed";
  const showUnclaimed = status !== "claimed";

  return (
    <section className="sec" id="ledger" aria-labelledby="ledger-h">
      <div className="sec-head">
        <div>
          <h2 id="ledger-h">Ledger</h2>
          <p>
            Unclaimed entries are public tools found on validators&apos; own sites. Owners turn them into signed
            claims with their identity key.
          </p>
        </div>
        <div className="filters">
          {MULTI_CLUSTER && (
          <Seg
            label="Filter by cluster"
            value={cluster}
            onChange={setCluster}
            options={[{ value: "all", label: "All clusters" }, ...ENABLED_CLUSTERS.map((c) => ({ value: c, label: CLUSTER_LABEL[c] }))]}
          />
          )}
          <Seg
            label="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "claimed", label: "Signed" },
              { value: "unclaimed", label: "Unclaimed" },
            ]}
          />
          <select
            className="select"
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "all")}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="search"
            type="search"
            placeholder="Search validator or tool"
            aria-label="Search validator or tool"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <p className="sr-only" role="status">
        {showSigned ? visible.length : 0} {visible.length === 1 && showSigned ? "validator" : "validators"} and{" "}
        {showUnclaimed ? visibleUnclaimed.length : 0} unclaimed tools shown
      </p>
      {showSigned && (
      <div className="table-wrap">
        <table className="ledger" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">#</th>
              <th scope="col" role="columnheader">Validator</th>
              <th scope="col" role="columnheader">Tools</th>
              <th scope="col" role="columnheader" style={{ textAlign: "right" }}>
                Count
              </th>
              <th scope="col" role="columnheader">Status</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {visible.length === 0 ? (
              <tr role="row">
                <td role="cell" colSpan={5} className="empty">
                  No validators match those filters.
                </td>
              </tr>
            ) : (
              visible.map((r, i) => {
                const name = displayName(r.validator);
                const site = safeHttpUrl(r.validator.website);
                return (
                  <tr role="row" key={`${r.validator.cluster}:${r.validator.identity}`}>
                    <td role="cell" className="rank">{i + 1}</td>
                    <td role="cell" className="c-validator">
                      <div className="vcell">
                        <Avatar name={name} iconUrl={r.validator.iconUrl} />
                        <div>
                          <div className="vname">
                            <Link href={`/v/${encodeURIComponent(r.validator.identity)}`}>{name}</Link>
                          </div>
                          <div className="vsub">
                            <span className="mono" title={r.validator.identity}>{shortKey(r.validator.identity)}</span>
                            {site ? <> · {new URL(site).host}</> : null}
                            {MULTI_CLUSTER && (
                              <>
                                {" "}· <span className="cluster-tag">{CLUSTER_LABEL[r.validator.cluster]}</span>
                              </>
                            )}
                          </div>
                          {(r.pools?.length || r.sfdp?.participant) ? (
                            <div className="pool-row">
                              <PoolBadges pools={r.pools} max={3} />
                              <SfdpBadge participant={r.sfdp?.participant} compact />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td role="cell" className="c-tools">
                      <div className="tools">
                        {r.tools.length === 0 ? (
                          <span className="vsub">No tools yet</span>
                        ) : (
                          r.tools.map((t) => <ToolChip key={t.id} tool={t} status={t.status} />)
                        )}
                      </div>
                    </td>
                    <td role="cell" className="count" aria-label={`${r.toolCount} tools`}>{r.toolCount}</td>
                    <td role="cell" className="c-status">
                      <StatusPill status={rowStatus(r)} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}
      {showUnclaimed && visibleUnclaimed.length > 0 && (
        <div className="panel" id="unclaimed" style={{ marginTop: 16 }}>
          <h3 className="label" style={{ marginBottom: 10 }}>Unclaimed tools</h3>
          <ul className="list">
            {visibleUnclaimed.map((t) => (
              <li key={t.id}>
                <ToolChip tool={t} />
                <UnclaimedBy name={t.owner?.name ?? "an unknown validator"} sourceUrl={t.owner?.sourceUrl ?? null} />
                {" · "}
                <Link className="linkplain" href={claimLink(t)} aria-label={`Claim ${t.name}`}>Claim this</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
