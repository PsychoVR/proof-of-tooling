import { isValidPubkey } from "@/lib/claims";

/** A decoded, valid validator identity (base58 for 32 bytes), or null. Never throws on bad input. */
export function parseIdentityParam(raw: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return isValidPubkey(value) ? value : null;
}

/** A decoded tool slug (lowercase letters, digits and dashes), or null. Never throws on bad input. */
export function parseSlugParam(raw: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return /^[a-z0-9][a-z0-9-]{0,127}$/.test(value) ? value : null;
}
