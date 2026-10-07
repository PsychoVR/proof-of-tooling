/** Odometer digits for the social preview, zero-padded like the counter on the home page. */
export function odometerDigits(value: number, minDigits = 4): string[] {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return Array.from(String(safe).padStart(minDigits, "0"));
}

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** How long a rendered image is reused by this process and by shared caches. */
export const OG_MEMO_MS = 10 * 60_000;
export const OG_CACHE_CONTROL = "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";
/** Served when the database could not be read: the counters are left out, and it is not cached for long. */
export const OG_FALLBACK_CACHE_CONTROL = "public, max-age=60, s-maxage=60";
