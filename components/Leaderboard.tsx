"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES, CLUSTERS, type Category, type Cluster, type LeaderboardRow } from "@/lib/types";
import { CLUSTER_LABEL, displayName, safeHttpUrl, shortKey } from "@/lib/ui/format";
import { Avatar } from "./Avatar";
import { StatusPill } from "./StatusPill";
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

function rowStatus(r: LeaderboardRow): "claimed" | "stale" | "unclaimed" {
  if (r.tools.some((t) => t.status === "signed")) return "claimed";
  return r.tools.some((t) => t.status === "stale") ? "stale" : "unclaimed";
}

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const [cluster, setCluster] = useState<Cluster | "all">("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (cluster !== "all" && r.validator.cluster !== cluster) return false;
      if (category !== "all" && !r.tools.some((t) => t.category === category)) return false;
      if (status === "claimed" && !r.tools.some((t) => t.status === "signed")) return false;
      if (status === "unclaimed" && !r.tools.some((t) => t.status === "unclaimed")) return false;
      if (!q) return true;
      const hay = [r.validator.name ?? "", r.validator.identity, ...r.tools.map((t) => t.name)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, cluster, category, status, query]);

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
          <Seg
            label="Filter by cluster"
            value={cluster}
            onChange={setCluster}
            options={[{ value: "all", label: "All clusters" }, ...CLUSTERS.map((c) => ({ value: c, label: CLUSTER_LABEL[c] }))]}
          />
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
        {visible.length} {visible.length === 1 ? "validator" : "validators"} shown
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Validator</th>
              <th scope="col">Tools</th>
              <th scope="col" style={{ textAlign: "right" }}>
                Count
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  No validators match those filters.
                </td>
              </tr>
            ) : (
              visible.map((r, i) => {
                const name = displayName(r.validator);
                const site = safeHttpUrl(r.validator.website);
                return (
                  <tr key={`${r.validator.cluster}:${r.validator.identity}`}>
                    <td className="rank">{i + 1}</td>
                    <td>
                      <div className="vcell">
                        <Avatar name={name} iconUrl={r.validator.iconUrl} />
                        <div>
                          <div className="vname">
                            <Link href={`/v/${encodeURIComponent(r.validator.identity)}`}>{name}</Link>
                          </div>
                          <div className="vsub">
                            {site ? new URL(site).host : shortKey(r.validator.identity)} ·{" "}
                            <span className="cluster-tag">{CLUSTER_LABEL[r.validator.cluster]}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="tools">
                        {r.tools.length === 0 ? (
                          <span className="vsub">No tools yet</span>
                        ) : (
                          r.tools.map((t) => <ToolChip key={t.id} tool={t} status={t.status} />)
                        )}
                      </div>
                    </td>
                    <td className="count">{r.toolCount}</td>
                    <td>
                      <StatusPill status={rowStatus(r)} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
