// Rate limiter en memoria. Adecuado para una sola instancia.
// Para producción multi-instancia: usar Redis / Upstash.
const buckets = new Map();

function getClientKey(request, scope) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  const ip = fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

/**
 * @param {Request} request
 * @param {{ scope: string, limit: number, windowMs: number }} opts
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function rateLimit(request, { scope, limit, windowMs }) {
  const key = getClientKey(request, scope);
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// Limpieza periódica para no acumular memoria
if (typeof globalThis.__rateLimitCleanup === 'undefined') {
  globalThis.__rateLimitCleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets.entries()) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }, 60_000).unref?.();
}
