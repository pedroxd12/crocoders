import { after, NextResponse } from 'next/server';
import {
  leerPuntajes,
  contarPendientes,
  sincronizar,
  sincronizarEnSegundoPlano,
  haySincronizacionEnCurso,
  TTL_MINUTOS,
} from '@/lib/puntajes-sync';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { isTransientDbError } from '@/lib/db-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// La sincronización corre DESPUÉS de responder, pero sigue contando dentro de
// la duración de la función. Sin este margen la plataforma corta la invocación
// con el límite por defecto (10 s en Vercel) y el lote muere a mitad.
export const maxDuration = 60;

// GET siempre responde desde la BD: unos pocos milisegundos, sin depender de
// que Codeforces/VJudge/omegaUp estén disponibles ni de una caché en memoria
// que se pierde en cada arranque en frío. Si hay cuentas vencidas se lanza la
// sincronización en segundo plano y la respuesta lo indica en `meta`.
const PRESUPUESTO_FONDO_MS = 45000;
const LIMITE_FONDO = 40;

// POST (botón "actualizar") sincroniza de verdad, pero la respuesta no espera
// a que termine: antes podía tardar los 22 s del presupuesto — o los ~50 s del
// lote de fondo, porque `sincronizar()` devuelve la tarea en curso cuando ya
// hay una — y desde fuera parecía que la página se colgaba. Ahora se responde
// con lo que haya en BD y el resto se termina en `after()`; la página revalida
// sola cada 10 s mientras queden cuentas pendientes, así que los datos nuevos
// entran igual.
const PRESUPUESTO_MANUAL_MS = 22000;
const LIMITE_MANUAL = 24;
const ESPERA_MAXIMA_MANUAL_MS = 9000;

// Ventana de caché de la CDN.
//
// Estuvo en `s-maxage=60, stale-while-revalidate=86400` para que nadie pagara
// el arranque en frío (3.3 s con MISS frente a 0.43 s con HIT). El efecto
// secundario fue la queja de "la página de puntajes no se actualiza": con 24 h
// de ventana, quien abría la página recibía una copia guardada de horas antes
// aunque la base ya tuviera los totales nuevos. Y algo peor: cuando la CDN
// responde con HIT la función NO se ejecuta, así que esa visita tampoco
// disparaba el `after()` que sincroniza — la caché impedía que los datos se
// actualizasen.
//
// Ahora la ventana es corta porque el motivo original desapareció: /puntajes se
// renderiza en el servidor leyendo la base directamente, así que el primer
// pintado ya NO pasa por aquí y nadie espera un arranque en frío. Este endpoint
// sólo lo usan las revalidaciones en segundo plano de SWR (cada 10 s mientras
// queden cuentas por sincronizar), donde lo que importa es ver el avance.
const CACHE_GET = 'public, s-maxage=30, stale-while-revalidate=120';

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function respuesta({ resultados, actualizadoEn }, pendientes, cacheControl, metaExtra = {}) {
  return NextResponse.json(
    {
      resultados,
      meta: {
        actualizado_en: actualizadoEn,
        // OJO: `pendientes` cuenta PERFILES de plataforma (cada miembro tiene
        // hasta tres: Codeforces, VJudge y omegaUp), por eso es bastante mayor
        // que el número de personas del club. Para la pantalla se usa
        // `miembros_pendientes`, que es lo que alguien puede reconocer.
        pendientes: pendientes.cuentas,
        miembros_pendientes: pendientes.miembros,
        sincronizando: haySincronizacionEnCurso(),
        ttl_minutos: TTL_MINUTOS,
        total_miembros: resultados.length,
        ...metaExtra,
      },
    },
    {
      status: 200,
      headers: { 'Cache-Control': cacheControl },
    },
  );
}

// La base (Railway) se duerme: el primer request tras un rato de silencio puede
// fallar mientras arranca, aunque la capa de datos ya reintenta durante todo el
// arranque. Es transitorio y el cliente vuelve a pedirlo cada 3 s, así que se
// registra como aviso; `console.error` lo convertiría en un error de pantalla
// completa en el overlay de desarrollo por algo que se recupera solo.
function registrarFallo(contexto, error) {
  if (isTransientDbError(error)) {
    console.warn(`[puntajes] ${contexto}: base no disponible (${error.code || error.message}), se reintentará.`);
  } else {
    console.error(`[puntajes] ${contexto} falló:`, error?.message || error);
  }
}

export async function GET() {
  try {
    const [datos, pendientes] = await Promise.all([leerPuntajes(), contarPendientes()]);

    if (pendientes.cuentas > 0) {
      // `after` mantiene viva la invocación hasta que el lote termina. Como
      // promesa suelta, la plataforma congelaba el proceso al enviar la
      // respuesta y el trabajo se perdía a medio hacer.
      after(() =>
        sincronizarEnSegundoPlano({
          presupuestoMs: PRESUPUESTO_FONDO_MS,
          limite: LIMITE_FONDO,
        }),
      );
    }

    return respuesta(datos, pendientes, CACHE_GET);
  } catch (error) {
    registrarFallo('GET', error);
    return NextResponse.json(
      { resultados: [], meta: { error: 'service_unavailable' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

/**
 * Fuerza un refresco. `?forzar=1` ignora el TTL y revisa las cuentas más
 * antiguas aunque se hayan sincronizado hace poco; sin él sólo procesa las que
 * ya vencieron, que es lo que normalmente quiere el botón de actualizar.
 *
 * Requiere sesión y está limitado por IP: cada llamada consulta las APIs de
 * Codeforces/VJudge/omegaUp, escribe en `cuenta_plataforma` y ocupa la función
 * hasta `maxDuration` (60 s). Abierto, una sola máquina podía lanzarlo en bucle
 * y agotar la cuota de esas APIs —marcando como fallidas cuentas de miembros
 * reales—, el pool de conexiones y el presupuesto de ejecución.
 */
export async function POST(request) {
  const rl = rateLimit(request, {
    scope: 'puntajes-sync',
    limit: 3,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { resultados: [], meta: { error: 'rate_limited' } },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const forzar = new URL(request.url).searchParams.get('forzar') === '1';
  // `forzar` salta el TTL de 3 h y vuelve a consultar cuentas ya frescas: es la
  // variante cara, reservada a administración.
  if (forzar) {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;
  }

  // Si ya hay un lote en vuelo no se arranca otro ni se espera a que termine:
  // se responde con lo que hay y se avisa en `meta` para que la pantalla diga
  // "ya hay una actualización en curso" en vez de fingir un refresco propio.
  if (haySincronizacionEnCurso()) {
    try {
      const [datos, pendientes] = await Promise.all([leerPuntajes(), contarPendientes()]);
      return respuesta(datos, pendientes, 'no-store', { reutilizada: true });
    } catch (error) {
      registrarFallo('POST (lote en curso)', error);
      return NextResponse.json(
        { resultados: [], meta: { error: 'service_unavailable' } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  // Aunque la sincronización falle seguimos devolviendo lo que hay en BD: es
  // mejor mostrar datos de hace unas horas que un error en pantalla.
  let resultadoSync = null;
  const tarea = sincronizar({
    presupuestoMs: PRESUPUESTO_MANUAL_MS,
    limite: LIMITE_MANUAL,
    forzar,
  })
    .then((resultado) => {
      resultadoSync = resultado;
      return resultado;
    })
    .catch((error) => {
      console.error('[puntajes] sincronización manual falló:', error.message);
    });

  const termino = await Promise.race([
    tarea.then(() => true),
    dormir(ESPERA_MAXIMA_MANUAL_MS).then(() => false),
  ]);
  // Si aún no acabó, que la plataforma la deje terminar tras la respuesta.
  if (!termino) after(() => tarea);

  try {
    const [datos, pendientes] = await Promise.all([leerPuntajes(), contarPendientes()]);
    return respuesta(datos, pendientes, 'no-store', {
      reutilizada: resultadoSync?.reutilizada === true,
    });
  } catch (error) {
    registrarFallo('POST', error);
    return NextResponse.json(
      { resultados: [], meta: { error: 'service_unavailable' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
