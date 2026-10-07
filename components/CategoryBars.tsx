import { CATEGORIES, type Stats } from "@/lib/types";

export function CategoryBars({ byCategory }: { byCategory: Stats["byCategory"] }) {
  const max = Math.max(...CATEGORIES.map((c) => byCategory[c] ?? 0), 1);
  const scaleMax = Math.max(4, Math.ceil(max / 4) * 4);
  return (
    <ul className="bars" aria-label="Tools by category">
      {CATEGORIES.map((c) => {
        const n = byCategory[c] ?? 0;
        return (
          <li className="bar" key={c}>
            <span>{c}</span>
            <div className="track" aria-hidden="true">
              <div
                className={`fill${c === "Meta" ? " meta" : ""}`}
                style={{ width: `${(n / scaleMax) * 100}%` }}
              />
            </div>
            <span className="n">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}
