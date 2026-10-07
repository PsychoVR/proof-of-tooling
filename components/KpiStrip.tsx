import type { Stats } from "@/lib/types";

export function KpiStrip({ stats }: { stats: Stats }) {
  const items = [
    { label: "Validators", value: stats.validatorsWithTools, accent: false },
    { label: "Signed claims", value: stats.toolsClaimed, accent: false },
    { label: "Unclaimed", value: stats.toolsUnclaimed, accent: false },
    { label: "Tools counting tools", value: 1, accent: true },
  ];
  return (
    <dl className="kpis" style={{ margin: 0 }}>
      {items.map((k) => (
        <div className="kpi" key={k.label}>
          <dt className="label">{k.label}</dt>
          <dd className={`v${k.accent ? " accent" : ""}`} style={{ margin: 0 }}>
            {k.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
