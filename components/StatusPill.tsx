import type { ClaimStatus, ToolHealth, ToolStatus } from "@/lib/types";

const LABELS: Record<ToolStatus | ClaimStatus | ToolHealth, string> = {
  claimed: "✓ Signed",
  unclaimed: "Unclaimed",
  active: "Active",
  stale: "Stale",
  withdrawn: "Withdrawn",
  rejected: "Rejected",
  slow: "Slow",
  dormant: "Dormant",
  unknown: "Unknown",
};

export function StatusPill({ status }: { status: ToolStatus | ClaimStatus | ToolHealth }) {
  return <span className={`status ${status}`}>{LABELS[status]}</span>;
}
