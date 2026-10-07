import Link from "next/link";
import type { LeaderboardToolStatus, Tool } from "@/lib/types";

/** Links to the internal tool page. Names are rendered as text only. */
export function ToolChip({
  tool,
  status,
}: {
  tool: Pick<Tool, "slug" | "name" | "category">;
  status?: LeaderboardToolStatus;
}) {
  return (
    <Link className={status ? `tool ${status}` : "tool"} href={`/t/${encodeURIComponent(tool.slug)}`}>
      {tool.name} <span className="cat">{tool.category}</span>
      {status && <span className="sr-only"> ({status})</span>}
    </Link>
  );
}
