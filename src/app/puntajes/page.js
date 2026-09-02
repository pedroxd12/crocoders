// src/app/puntajes/page.js
//
// Server Component: lee los puntajes de la base y los manda dentro del HTML.
//
// Esto no es sólo una mejora de velocidad, es EL arreglo a "la página de
// puntajes no se actualiza". Antes la tabla se llenaba desde el cliente
// pidiendo /api/puntajes, y esa respuesta pasa por la caché de la CDN con una
// ventana `stale-while-revalidate` larga: el visitante recibía una copia
// guardada —potencialmente de horas antes— aunque la base ya tuviera los
// totales nuevos. Leyendo aquí, el primer pintado sale siempre de la base.
import { leerPuntajes, contarPendientes, TTL_MINUTOS } from '@/lib/puntajes-sync';
import { isTransientDbError } from '@/lib/db-server';
import PuntajesClient from './PuntajesClient';

// `leerPuntajes` consulta Postgres por el driver `pg`, no por `fetch`: sin esta
// línea Next da la página por estática, ejecuta la consulta una sola vez en el
// build y sirve un ranking congelado hasta el siguiente despliegue.
export const dynamic = 'force-dynamic';

// La precarga no puede bloquear el HTML: con la base dormida, la capa de datos
// se pasa reintentando hasta ~20 s (ver `db-server`) mientras Postgres arranca,
// y eso sería el TTFB de esta página (además del límite de la función en Vercel).
// Pasado este margen se sirve el HTML sin datos y SWR sigue insistiendo desde el
// cliente — exactamente el camino que ya existía para cualquier fallo de lectura.
const ESPERA_MAXIMA_PRECARGA_MS = 5000;

function conLimiteDeTiempo(promesa, ms) {
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('precarga-agotada')), ms);
  });
  // La promesa perdedora puede rechazar DESPUÉS de que termine la carrera, y ahí
  // ya no tendría quien la escuche: se absorbe para no provocar un
  // `unhandledRejection` que en Node tumba el proceso.
  promesa.catch(() => {});
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

export const metadata = {
  title: 'Puntajes',
  description:
    'Ranking de problemas resueltos por los miembros del club Crocoders en Codeforces, VJudge y omegaUp.',
  alternates: { canonical: '/puntajes' },
};

export default async function PuntajesPage() {
  let datosIniciales;
  try {
    const [datos, pendientes] = await conLimiteDeTiempo(
      Promise.all([leerPuntajes(), contarPendientes()]),
      ESPERA_MAXIMA_PRECARGA_MS,
    );
    // Misma forma que devuelve GET /api/puntajes: el cliente usa este objeto
    // como `fallbackData` de SWR y las revalidaciones posteriores traen esa
    // estructura. Si divergieran, la tabla se repintaría al primer refresco.
    //
    // El round-trip por JSON no es adorno: `leerPuntajes` devuelve las fechas
    // como objetos `Date` (el driver de pg), mientras que el API las entrega ya
    // convertidas a texto por `NextResponse.json`. Sin igualarlas, el mismo
    // campo sería un Date en el primer render y una cadena tras la primera
    // revalidación. Esto produce exactamente los mismos bytes que el endpoint.
    datosIniciales = JSON.parse(
      JSON.stringify({
        resultados: datos.resultados,
        meta: {
          actualizado_en: datos.actualizadoEn,
          pendientes: pendientes.cuentas,
          miembros_pendientes: pendientes.miembros,
          // No se llama a `haySincronizacionEnCurso()`: es estado en memoria de
          // la función que sirve el API, y esta página se renderiza en otra
          // invocación, así que aquí siempre sería false y sólo confundiría.
          // La insignia de "sincronizando" aparece igual porque se muestra
          // cuando hay pendientes.
          sincronizando: false,
          ttl_minutos: TTL_MINUTOS,
          total_miembros: datos.resultados.length,
        },
      }),
    );
  } catch (error) {
    // Un fallo de base no debe dejar la página en blanco: se manda el HTML sin
    // datos y SWR reintenta desde el cliente, como hacía antes.
    //
    // Que la base esté dormida o arrancando (Railway) es lo ESPERADO en la
    // primera visita tras un rato de silencio, y ya está cubierto por ese
    // reintento: se registra como aviso, no como error. Con `console.error` el
    // overlay de desarrollo de Next lo saca a pantalla completa —«the database
    // system is starting up»— como si la página se hubiera roto.
    if (error?.message === 'precarga-agotada' || isTransientDbError(error)) {
      console.warn(
        `[puntajes] la base aún no responde (${error.code || error.message}): se sirve ` +
          'la página sin datos y el cliente reintenta.',
      );
    } else {
      console.error('Error al precargar puntajes en el servidor:', error);
    }
    datosIniciales = undefined;
  }

  return <PuntajesClient datosIniciales={datosIniciales} />;
}
