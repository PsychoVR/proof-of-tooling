export function StatusStack({ claimed, unclaimed }: { claimed: number; unclaimed: number }) {
  const total = claimed + unclaimed;
  const groups = [
    { label: "Signed", n: claimed, color: "var(--ok)" },
    { label: "Unclaimed", n: unclaimed, color: "var(--muted)" },
  ];
  return (
    <div className="split">
      <span className="label">Claim status</span>
      <div className="stack" aria-hidden="true">
        {groups
          .filter((g) => g.n > 0)
          .map((g) => (
            <i key={g.label} style={{ width: `${(g.n / Math.max(total, 1)) * 100}%`, background: g.color }} />
          ))}
      </div>
      <div className="legend">
        {groups.map((g) => (
          <span key={g.label} style={{ ["--c" as string]: g.color }}>
            {g.label} · {g.n}
          </span>
        ))}
      </div>
    </div>
  );
}
