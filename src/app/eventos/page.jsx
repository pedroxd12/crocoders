// src/app/eventos/page.jsx
//
// Server Component. Consulta los eventos EN EL SERVIDOR y los manda ya dentro
// del HTML.
//
// Antes esta página era `'use client'` y pedía los datos después de hidratar,
// así que la secuencia real hasta ver un evento era, medida en producción:
//   HTML vacío (0.59 s) -> bajar ~253 KB de JS -> hidratar
//   -> /api/auth/verify (0.5 s) -> /api/eventos (0.49 s templado, 2.33 s en frío)
// Cuatro pasos EN SERIE, y lo único que llegaba en el HTML era el texto
// "Cargando eventos...". Ahora la consulta ocurre mientras se genera el HTML,
// en paralelo con la descarga del JS, y la lista se ve en el primer pintado.
import { listarEventosPublicos } from '@/lib/eventos-listado';
import EventosClient from './EventosClient';

// OBLIGATORIO. `listarEventosPublicos` habla con Postgres por el driver `pg`,
// no por `fetch`, así que Next no tiene forma de saber que el resultado cambia
// entre peticiones: sin esta línea da la página por estática, ejecuta la
// consulta UNA vez durante el build y sirve esos eventos congelados hasta el
// siguiente despliegue. Comprobado en la salida del build, que marcaba
// `○ /eventos` (Static) en lugar de `ƒ` (Dynamic).
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Eventos',
  description:
    'Conferencias, talleres y concursos del club de algoritmia Crocoders. Consulta las próximas fechas e inscríbete.',
  alternates: { canonical: '/eventos' },
};

export default async function EventosPage() {
  let eventosIniciales;
  try {
    eventosIniciales = await listarEventosPublicos();
  } catch (error) {
    // Que la base falle no debe dejar la página en blanco: se envía el HTML sin
    // datos y el cliente reintenta por su cuenta con SWR (al no recibir
    // `fallbackData`, vuelve a activar su carga normal contra /api/eventos).
    // Es exactamente el comportamiento que había antes de renderizar en
    // servidor, así que el peor caso no empeora respecto a lo que ya existía.
    console.error('Error al precargar eventos en el servidor:', error);
    eventosIniciales = undefined;
  }

  return <EventosClient eventosIniciales={eventosIniciales} />;
}
