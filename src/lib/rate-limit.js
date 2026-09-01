// Rate limiter en memoria. Adecuado para una sola instancia.
//
// LIMITACIÓN CONOCIDA (importante): el despliegue es serverless, así que cada
// instancia fría arranca con este Map vacío y varias atienden peticiones a la
// vez. El techo real de intentos es, por tanto, bastante más alto que el
// número que se configura aquí, y una IP rotatoria lo evade del todo.
//
// Mientras no haya un almacén compartido (Redis / Upstash), la mitigación es
// elegir bien la CLAVE: limitar por cuenta/recurso con `key` en vez de por IP
// hace que rotar de IP no sirva de nada dentro de la misma instancia, y evita
// castigar a una sala entera detrás de un NAT. Los endpoints sensibles
// (login, verify-token) ya combinan un límite por IP con otro por cuenta.
//
// Cuando exista Redis, basta con reemplazar este Map por ese almacén: la firma
// de `rateLimit` no cambia y los llamadores no se tocan.
const buckets = new Map();

// Tope de entradas para que un atacante que rote IPs no haga crecer el Map sin
// límite hasta agotar la memoria del proceso.
const MAX_BUCKETS = 20000;

function getClientIp(request) {
  // Orden deliberado: las cabeceras que fija el proxy de la plataforma van
  // primero. `x-forwarded-for` la puede enviar el propio cliente, así que solo
  // se usa como último recurso y quedándonos con la primera entrada.
  const vercelFwd = request.headers.get('x-vercel-forwarded-for');
  if (vercelFwd) return vercelFwd.split(',')[0].trim();

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || 'unknown';
}

/**
 * @param {Request} request
 * @param {{ scope?: string, key?: string, limit: number, windowMs: number }} opts
 *   `scope` limita por IP dentro de ese ámbito. `key` limita por un
 *   identificador propio (p. ej. una inscripción) ignorando la IP, útil cuando
 *   el abuso puede venir desde muchas IPs distintas.
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function rateLimit(request, { scope, key, limit, windowMs }) {
  const bucketKey = key || `${scope}:${getClientIp(request)}`;
  const now = Date.now();
  const entry = buckets.get(bucketKey);

  if (!entry || entry.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) purgarVencidos(now);
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

function purgarVencidos(now = Date.now()) {
  for (const [k, v] of buckets.entries()) {
    if (v.resetAt <= now) buckets.delete(k);
  }
  // Si aun así seguimos en el tope, todas las ventanas están vivas: se descarta
  // la mitad más antigua antes que quedarnos sin memoria.
  if (buckets.size >= MAX_BUCKETS) {
    const ordenadas = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < Math.floor(ordenadas.length / 2); i++) {
      buckets.delete(ordenadas[i][0]);
    }
  }
}

// Limpieza periódica para no acumular memoria
if (typeof globalThis.__rateLimitCleanup === 'undefined') {
  globalThis.__rateLimitCleanup = setInterval(() => purgarVencidos(), 60_000).unref?.();
}
