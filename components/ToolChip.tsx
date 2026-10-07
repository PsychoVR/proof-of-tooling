import Link from "next/link";
import type { Tool } from "@/lib/types";

/** Links to the internal tool page. Names are rendered as text only. */
export function ToolChip({ tool }: { tool: Pick<Tool, "slug" | "name" | "category"> }) {
  return (
    <Link className="tool" href={`/t/${encodeURIComponent(tool.slug)}`}>
      {tool.name} <span className="cat">{tool.category}</span>
    </Link>
  );
}
