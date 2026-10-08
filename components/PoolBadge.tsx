"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { PoolBadge as PoolBadgeData } from "@/lib/types";
import { formatPoolLabel, splitPools } from "@/lib/ui/format";

/**
 * Keyboard-focusable badge with an immediate tooltip on hover and focus. The tooltip is fixed-positioned so
 * the scrolling table wrapper cannot clip it. `label` is also the accessible name and the native title.
 */
function Tip({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(Math.max(r.left + r.width / 2, 110), Math.max(110, window.innerWidth - 110));
    setPos({ x, y: r.top });
  }, []);
  const hide = useCallback(() => setPos(null), []);
  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", show, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", show, true);
    };
  }, [pos, hide, show]);
  return (
    <span
      ref={ref}
      className={className}
      tabIndex={0}
      role="img"
      aria-label={label}
      title={label}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos && (
        <span className="pool-tip" aria-hidden="true" style={{ left: pos.x, top: pos.y }}>
          {label}
        </span>
      )}
    </span>
  );
}

function Logo({ pool }: { pool: PoolBadgeData }) {
  const own = pool.logo.startsWith("/pools/") && !pool.logo.includes("..") && !pool.logo.startsWith("//");
  return (
    <span className="pool-ico" aria-hidden="true">
      {own ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny logo that ships in /public/pools
        <img src={pool.logo} alt="" width={18} height={18} loading="lazy" decoding="async" />
      ) : (
        pool.name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}

/** One pool. Every pool gets the same size and style; `chip` adds the name as visible text. */
export function PoolBadge({ pool, chip = false }: { pool: PoolBadgeData; chip?: boolean }) {
  return (
    <Tip label={formatPoolLabel(pool.name, pool.sol)} className={chip ? "pool-badge chip" : "pool-badge"}>
      <Logo pool={pool} />
      {chip && <span className="pool-name">{pool.name}</span>}
    </Tip>
  );
}

/** "SFDP participant": rendered only when the Foundation list says so. `compact` shortens the visible text. */
export function SfdpBadge({ participant, compact = false }: { participant?: boolean | null; compact?: boolean }) {
  if (participant !== true) return null;
  return (
    <Tip label="SFDP participant" className="pool-badge sfdp chip">
      <span className="pool-name">{compact ? "SFDP" : "SFDP participant"}</span>
    </Tip>
  );
}

/** Ordered pool badges, optionally capped at `max` with a "+N" that names the rest. Renders nothing when empty. */
export function PoolBadges({ pools, max, chip = false }: { pools?: PoolBadgeData[]; max?: number; chip?: boolean }) {
  if (!pools || pools.length === 0) return null;
  const { shown, hidden } = splitPools(pools, max ?? pools.length);
  return (
    <>
      {shown.map((p) => (
        <PoolBadge key={p.id} pool={p} chip={chip} />
      ))}
      {hidden.length > 0 && (
        <Tip label={`Also: ${hidden.map((p) => formatPoolLabel(p.name, p.sol)).join(", ")}`} className="pool-badge more">
          <span className="pool-name">+{hidden.length}</span>
        </Tip>
      )}
    </>
  );
}
