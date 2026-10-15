import Link from "next/link";
import { shareRankUrl, type LiveTopEntry, type TopEntry } from "@/lib/top";
import type { NewTool } from "@/lib/top-queries";
import { Avatar } from "./Avatar";
import { Odometer } from "./Odometer";
import { PoolBadges, SfdpBadge } from "./PoolBadge";
import { showSfdpLabel } from "@/lib/ui/format";

/** An entry as the board renders it. Live entries carry badges; frozen ones from a snapshot do not. */
export type BoardEntry = TopEntry & Partial<Pick<LiveTopEntry, "pools" | "sfdp">> & { iconUrl?: string | null };

function ShareRank({ entry, period }: { entry: BoardEntry; period?: string }) {
  return (
    <a
      className="btn sm share"
      href={shareRankUrl(entry, period)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Share the rank of ${entry.name} on X`}
    >
      Share my rank
    </a>
  );
}

function Badges({ entry }: { entry: BoardEntry }) {
  const sfdp = showSfdpLabel(entry.pools, entry.sfdp);
  if ((entry.pools?.length ?? 0) === 0 && !sfdp) return null;
  return (
    <div className="pool-row">
      <PoolBadges pools={entry.pools} max={3} />
      <SfdpBadge participant={sfdp} compact />
    </div>
  );
}

function PodiumCard({ entry, period }: { entry: BoardEntry; period?: string }) {
  return (
    <li className={`podium-card place-${entry.rank}`} aria-label={`Number ${entry.rank}: ${entry.name}, ${entry.toolCount} tools`}>
      <span className="podium-rank" aria-hidden="true">#{entry.rank}</span>
      <Avatar name={entry.name} iconUrl={entry.iconUrl} xl />
      <Link className="podium-name" href={`/v/${encodeURIComponent(entry.identity)}`}>{entry.name}</Link>
      <div className="podium-count">
        <Odometer value={entry.toolCount} caption={entry.toolCount === 1 ? "tool" : "tools"} sub="" minDigits={2} />
      </div>
      <Badges entry={entry} />
      <ShareRank entry={entry} period={period} />
    </li>
  );
}

/** Podium for the first three places and a compact list for the rest. */
export function TopBuilders({ entries, period }: { entries: BoardEntry[]; period?: string }) {
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  return (
    <>
      <ol className="podium" aria-label="Top three builders">
        {podium.map((e) => (
          <PodiumCard key={e.identity} entry={e} period={period} />
        ))}
      </ol>
      {rest.length > 0 && (
        <ol className="toplist" start={4} aria-label="Builders ranked four to ten">
          {rest.map((e) => (
            <li key={e.identity}>
              <span className="rank">{e.rank}</span>
              <Avatar name={e.name} iconUrl={e.iconUrl} />
              <Link className="toplist-name" href={`/v/${encodeURIComponent(e.identity)}`}>{e.name}</Link>
              <Badges entry={e} />
              <span className="toplist-count" aria-label={`${e.toolCount} tools`}>{e.toolCount}</span>
              <ShareRank entry={e} period={period} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** Shown in place of the board until enough validators hold an active claim. */
export function TopComingSoon() {
  return (
    <div className="panel top-soon">
      <p>
        <b>Top builders: coming soon.</b> Claim your tools to get on the board.
      </p>
      <Link className="btn primary" href="/claim">Claim a tool</Link>
    </div>
  );
}

/** Tools claimed this month, each with the validator that signed it. */
export function NewThisMonth({ items }: { items: NewTool[] }) {
  if (items.length === 0) return null;
  return (
    <div className="panel new-month">
      <h3 className="label" style={{ marginBottom: 10 }}>New this month</h3>
      <ul className="list">
        {items.map((t) => (
          <li key={`${t.toolSlug}:${t.identity}`}>
            <Link className="linkplain" href={`/t/${encodeURIComponent(t.toolSlug)}`}>{t.toolName}</Link>
            <span className="vsub">
              by <Link className="linkplain" href={`/v/${encodeURIComponent(t.identity)}`}>{t.validatorName}</Link>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
