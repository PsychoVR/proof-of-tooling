/**
 * In-memory sliding-window limiter. Per process, which is enough for a single Node app.
 * Memory is bounded: expired keys are pruned at most once per window, and the number of keys has a
 * hard cap (the least recently used keys are evicted first).
 */
export function createRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
  maxKeys = 10_000,
) {
  // Map iteration order is insertion order; a key is re-inserted on every hit, so the first key is the oldest.
  const hits = new Map<string, number[]>();
  let lastPrune = now();

  function prune(t: number) {
    lastPrune = t;
    for (const [k, v] of hits) if (v[v.length - 1] <= t - windowMs) hits.delete(k);
  }

  function allow(key: string): boolean {
    const t = now();
    if (t - lastPrune >= windowMs) prune(t);
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    const allowed = recent.length < limit;
    if (allowed) recent.push(t);
    hits.delete(key);
    if (recent.length > 0) hits.set(key, recent);
    while (hits.size > maxKeys) hits.delete(hits.keys().next().value as string);
    return allowed;
  }

  /** True when the key has used up its allowance, without counting a hit. */
  allow.exhausted = (key: string): boolean => {
    const t = now();
    return (hits.get(key) ?? []).filter((x) => t - x < windowMs).length >= limit;
  };
  return allow;
}
