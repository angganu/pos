/**
 * Fixed-window failure counter, kept in memory.
 *
 * Enough for a single-server install. If the app is ever run on several
 * instances, back this with a shared store (Redis, the database) instead.
 */
type Bucket = { count: number; resetAt: number };

export function createLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>();

  function sweep(now: number) {
    if (buckets.size < 5000) return;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  return {
    /** Seconds until `key` may try again, or 0 when it is not blocked. */
    retryAfter(key: string): number {
      const b = buckets.get(key);
      const now = Date.now();
      if (!b || b.resetAt <= now) return 0;
      return b.count >= limit ? Math.ceil((b.resetAt - now) / 1000) : 0;
    },
    fail(key: string) {
      const now = Date.now();
      sweep(now);
      const b = buckets.get(key);
      if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + windowMs });
      else b.count += 1;
    },
    clear(key: string) {
      buckets.delete(key);
    },
  };
}

/** Best-effort client IP. Only trustworthy behind a proxy that sets these headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return req.headers.get("x-real-ip") || fwd?.split(",")[0].trim() || "unknown";
}
