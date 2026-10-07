/** Helpers for rendering on-chain and user-supplied values safely. All output is plain text. */

/** Returns the URL only when it is a plain http(s) URL, otherwise null. Blocks javascript: and data: URLs. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function shortKey(key: string, head = 6, tail = 4): string {
  return key.length <= head + tail + 1 ? key : `${key.slice(0, head)}…${key.slice(-tail)}`;
}

/** Validator display name: on-chain name when present, otherwise the shortened identity. */
export function displayName(v: { name: string | null; identity: string }): string {
  const name = v.name?.trim();
  return name ? name : shortKey(v.identity);
}

export function initialOf(name: string): string {
  const ch = Array.from(name.trim())[0];
  return ch ? ch.toUpperCase() : "?";
}

/** Lamports (decimal string) to SOL with thousands separators, no float precision loss. */
export function formatStake(lamports: string): string {
  if (!/^\d+$/.test(lamports)) return "n/a";
  const sol = BigInt(lamports) / 1_000_000_000n;
  return `${sol.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} SOL`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "n/a" : d.toISOString().slice(0, 10);
}

export function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export const CLUSTER_LABEL = { mainnet: "Mainnet", testnet: "Testnet", alpenglow: "Alpenglow" } as const;

/** Pill state for a tool on a validator or tool page: signed, waiting for review, or unclaimed. */
export function toolPillStatus(
  tool: { status: "claimed" | "unclaimed"; claims: { status: string; identity: string }[] },
  identity?: string,
): "claimed" | "pending" | "unclaimed" {
  if (tool.status === "claimed") return "claimed";
  const waiting = tool.claims.some((c) => c.status === "pending" && (!identity || c.identity === identity));
  return waiting ? "pending" : "unclaimed";
}
