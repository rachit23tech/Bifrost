import { Request, Response, NextFunction } from 'express';

interface Options {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per key per window. */
  max: number;
  /** Identifies the caller. Defaults to the client IP. */
  keyFn?: (req: Request) => string;
  /** Clock, injectable so tests don't have to sleep. */
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter held in process memory.
 *
 * Each key gets a counter that resets when its window ends. This is the
 * simplest scheme and allows a burst of up to 2x `max` across a window
 * boundary; that is acceptable here. State lives in this process, so it only
 * works for a single server instance. Running several instances would need a
 * shared store such as Redis.
 */
export function rateLimit({ windowMs, max, keyFn, now = Date.now }: Options) {
  const buckets = new Map<string, Bucket>();

  // Drop expired buckets so the map does not grow with every IP ever seen.
  const sweep = setInterval(() => {
    const t = now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= t) buckets.delete(key);
    }
  }, windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn ? keyFn(req) : req.ip || 'unknown';
    const t = now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const retryAfterSec = Math.ceil((bucket.resetAt - t) / 1000);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(retryAfterSec));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    next();
  };
}
