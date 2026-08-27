import { NextResponse } from 'next/server';
import {
  leerPuntajes,
  contarPendientes,
  sincronizar,
  sincronizarEnSegundoPlano,
  haySincronizacionEnCurso,
  TTL_MINUTOS,
} from '@/lib/puntajes-sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET siempre responde desde la BD: unos pocos milisegundos, sin depender de
// que Codeforces/VJudge/omegaUp estén disponibles ni de una caché en memoria
// que se pierde en cada arranque en frío. Si hay cuentas vencidas se lanza la
// sincronización en segundo plano y la respuesta lo indica en `meta`.
const PRESUPUESTO_FONDO_MS = 50000;
const LIMITE_FONDO = 40;

// POST (botón "actualizar") sí espera, pero con un presupuesto acotado para no
// agotar el tiempo máximo de la función serverless.
const PRESUPUESTO_MANUAL_MS = 22000;
const LIMITE_MANUAL = 24;

function respuesta({ resultados, actualizadoEn }, pendientes) {
  return NextResponse.json(
    {
      resultados,
      meta: {
        actualizado_en: actualizadoEn,
        pendientes,
        sincronizando: haySincronizacionEnCurso(),
        ttl_minutos: TTL_MINUTOS,
        total_miembros: resultados.length,
      },
    },
    {
      status: 200,
      // Respuesta pública e idéntica para todos: la CDN puede servirla y
      // revalidarla en segundo plano en vez de golpear la BD en cada visita.
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    },
  );
}

export async function GET() {
  try {
    const [datos, pendientes] = await Promise.all([leerPuntajes(), contarPendientes()]);

    if (pendientes > 0) {
      sincronizarEnSegundoPlano({
        presupuestoMs: PRESUPUESTO_FONDO_MS,
        limite: LIMITE_FONDO,
      });
    }

    return respuesta(datos, pendientes);
  } catch (error) {
    console.error('[puntajes] GET falló:', error.message);
    return NextResponse.json(
      { resultados: [], meta: { error: 'service_unavailable' } },
      { status: 503 },
    );
  }
}

/**
 * Fuerza un refresco. `?forzar=1` ignora el TTL y revisa las cuentas más
 * antiguas aunque se hayan sincronizado hace poco; sin él sólo procesa las que
 * ya vencieron, que es lo que normalmente quiere el botón de actualizar.
 */
export async function POST(request) {
  const forzar = new URL(request.url).searchParams.get('forzar') === '1';

  try {
    await sincronizar({
      presupuestoMs: PRESUPUESTO_MANUAL_MS,
      limite: LIMITE_MANUAL,
      forzar,
    });
  } catch (error) {
    // Aunque la sincronización falle seguimos devolviendo lo que hay en BD:
    // es mejor mostrar datos de hace unas horas que un error en pantalla.
    console.error('[puntajes] sincronización manual falló:', error.message);
  }

  try {
    const [datos, pendientes] = await Promise.all([leerPuntajes(), contarPendientes()]);
    return respuesta(datos, pendientes);
  } catch (error) {
    console.error('[puntajes] POST falló:', error.message);
    return NextResponse.json(
      { resultados: [], meta: { error: 'service_unavailable' } },
      { status: 503 },
    );
  }
}
