// src/app/api/cron/puntajes/route.js
//
// Sincronización de puntajes DISPARADA POR RELOJ, no por visitas.
//
// Por qué existe: hasta ahora el único disparador del sync era una visita a
// /api/puntajes (el `after()` del GET). Eso tenía dos consecuencias medidas:
//   1. Si nadie abre la página, nada se sincroniza y los totales envejecen sin
//      límite. Con el club entero mirando el ranking una vez al día, los datos
//      iban siempre un día por detrás de la realidad.
//   2. Peor: cuando la respuesta la sirve la caché de la CDN
//      (`X-Vercel-Cache: HIT`) la función NI SIQUIERA SE EJECUTA, así que esa
//      visita no dispara ningún sync. La caché que se puso para acelerar la
//      página estaba, de rebote, impidiendo que los datos se actualizaran.
// Con este endpoint el reloj hace el trabajo y las visitas sólo leen.
//
// Seguridad: consulta APIs de terceros con límites de peticiones y escribe en
// la base, así que no puede quedar abierto. Se exige `CRON_SECRET` por cabecera
// `Authorization: Bearer …`, que es justo lo que manda Vercel Cron y lo que
// puede mandar cualquier programador externo (GitHub Actions, cron-job.org).
// Sin la variable configurada el endpoint responde 503 en vez de quedarse
// abierto por omisión.
import { after, NextResponse } from 'next/server';
import { sincronizar, contarPendientes, haySincronizacionEnCurso } from '@/lib/puntajes-sync';

export const dynamic = 'force-dynamic';
// Tope del plan Hobby. El lote se corta solo por presupuesto antes de llegar.
export const maxDuration = 60;

// Se deja margen bajo `maxDuration` para que dé tiempo a responder y a cerrar
// las escrituras pendientes: si la plataforma corta la invocación en seco, el
// lote muere a medias.
const PRESUPUESTO_MS = 45000;
// Cuántas cuentas como mucho por ejecución. La consulta las toma de la más
// antigua a la más nueva (`ORDER BY ultima_actualizacion ASC NULLS FIRST`), así
// que ejecuciones sucesivas rotan por todas sin repetir las recién hechas.
const LIMITE = 60;

function noAutorizado(motivo) {
  return NextResponse.json(
    { ok: false, error: motivo },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    console.error('[cron/puntajes] falta CRON_SECRET: el endpoint queda deshabilitado.');
    return NextResponse.json(
      { ok: false, error: 'cron_no_configurado' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return noAutorizado('no_autorizado');
  }

  // Si ya hay un lote en vuelo (lo lanzó una visita hace un momento), no se
  // arranca otro: competirían por el límite de peticiones de Codeforces y se
  // marcarían como fallidas cuentas de miembros reales.
  if (haySincronizacionEnCurso()) {
    return NextResponse.json(
      { ok: true, omitido: 'sincronizacion_en_curso' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const tarea = sincronizar({ presupuestoMs: PRESUPUESTO_MS, limite: LIMITE }).catch((error) => {
    console.error('[cron/puntajes] la sincronización falló:', error.message);
    return null;
  });

  // `after` mantiene viva la invocación hasta que el lote termina; como promesa
  // suelta la plataforma congela el proceso al responder y el trabajo se pierde
  // a medio hacer (mismo motivo que en /api/puntajes).
  after(() => tarea);

  let pendientes = null;
  try {
    pendientes = await contarPendientes();
  } catch {
    // Informativo: que no tumbe la ejecución del cron.
  }

  return NextResponse.json(
    {
      ok: true,
      lanzado: true,
      pendientes_antes: pendientes,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
