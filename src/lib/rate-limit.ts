/**
 * In-memory rate limiter (per IP / per key).
 * Simple sliding-window counter — resets after windowMs.
 * Works in the Next.js Node.js runtime (not Edge).
 */

interface Record {
  count: number
  resetAt: number
}

const store = new Map<string, Record>()

// Clean up expired entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  Array.from(store.entries()).forEach(([key, record]) => {
    if (now > record.resetAt) store.delete(key)
  })
}, 5 * 60 * 1000)

/**
 * Check whether a key is within the rate limit.
 * @param key      — typically the client IP or user identifier
 * @param limit    — max requests per window (default 20)
 * @param windowMs — window length in ms (default 60 s)
 * @returns { allowed, remaining, resetAt }
 */
export function checkRateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  let record = store.get(key)

  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + windowMs }
    store.set(key, record)
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt }
  }

  record.count++
  return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt }
}
