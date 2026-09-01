// src/lib/evidencias-listado.js
//
// Consultas públicas de evidencias (fotos de actividades ya celebradas), en un
// solo sitio. Las comparten /api/evidencias y el Server Component de
// /evidencias, que precarga la línea de tiempo para mandarla dentro del HTML.
//
// Las columnas de las galerías van escritas en cada consulta y no en una
// constante interpolada: `sql` es un template tag que convierte TODO lo
// interpolado en un parámetro de la consulta, así que un `${COLUMNAS}` acabaría
// enviado como valor ($1) en lugar de como texto SQL.

import { sql } from '@/lib/db-server';

/**
 * Línea de tiempo mixta: eventos Y programas que tienen evidencias públicas,
 * ordenados por fecha desc. Cada item lleva `tipo_origen` ('evento'|'programa')
 * y `origen_id` para poder pedir después su galería.
 */
export async function listarTimelineEvidencias() {
  // UNION ALL de ambas fuentes con un esquema común; el front las mezcla y ordena.
  const timeline = await sql`
    SELECT
      'evento' AS tipo_origen,
      e.id_evento AS origen_id,
      e.nombre AS nombre_evento,
      e.fecha_inicio AS fecha,
      t.nombre AS tipo,
      e.ubicacion AS lugar,
      (SELECT COUNT(*) FROM evidencia ev WHERE ev.id_evento = e.id_evento AND ev.publica = true) AS num_evidencias,
      (SELECT ev.url FROM evidencia ev
        WHERE ev.id_evento = e.id_evento AND ev.publica = true
        ORDER BY ev.orden ASC, ev.fecha_captura DESC LIMIT 1) AS portada_url
    FROM evento e
    LEFT JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
    WHERE EXISTS (SELECT 1 FROM evidencia ev WHERE ev.id_evento = e.id_evento AND ev.publica = true)

    UNION ALL

    SELECT
      'programa' AS tipo_origen,
      p.id_programa AS origen_id,
      p.nombre AS nombre_evento,
      p.fecha_inicio AS fecha,
      t.nombre AS tipo,
      p.ubicacion AS lugar,
      (SELECT COUNT(*) FROM evidencia ev WHERE ev.id_programa = p.id_programa AND ev.publica = true) AS num_evidencias,
      (SELECT ev.url FROM evidencia ev
        WHERE ev.id_programa = p.id_programa AND ev.publica = true
        ORDER BY ev.orden ASC, ev.fecha_captura DESC LIMIT 1) AS portada_url
    FROM programa_recurrente p
    LEFT JOIN catalogo_tipo_evento t ON p.id_tipo_evento = t.id_tipo_evento
    WHERE EXISTS (SELECT 1 FROM evidencia ev WHERE ev.id_programa = p.id_programa AND ev.publica = true)

    ORDER BY fecha DESC
  `;

  return timeline.map((fila) => ({
    ...serializarFecha(fila),
    num_evidencias: Number(fila.num_evidencias) || 0,
  }));
}

/** Galería pública de un evento. */
export async function listarEvidenciasDeEvento(idEvento) {
  const filas = await sql`
    SELECT id_evidencia, id_evento, id_programa, titulo as nombre, descripcion, tipo,
           url as imagen_url, storage_key as imagen_key, publica, orden, fecha_captura as fecha
    FROM evidencia
    WHERE id_evento = ${Number(idEvento)} AND publica = true
    ORDER BY orden ASC, fecha_captura DESC
  `;
  return filas.map(serializarFecha);
}

/** Galería pública de un programa. */
export async function listarEvidenciasDePrograma(idPrograma) {
  const filas = await sql`
    SELECT id_evidencia, id_evento, id_programa, titulo as nombre, descripcion, tipo,
           url as imagen_url, storage_key as imagen_key, publica, orden, fecha_captura as fecha
    FROM evidencia
    WHERE id_programa = ${Number(idPrograma)} AND publica = true
    ORDER BY orden ASC, fecha_captura DESC
  `;
  return filas.map(serializarFecha);
}

/**
 * Las props de un Server Component tienen que ser serializables, y el driver de
 * pg devuelve las columnas DATE como objetos `Date`. Se pasan a cadena para que
 * el dato que viaja en el HTML sea idéntico al que devuelve el API en JSON —
 * que es lo que `JSON.stringify` haría con un Date de todos modos. Si
 * difirieran, la línea de tiempo se repintaría al hidratar.
 */
function serializarFecha(fila) {
  return {
    ...fila,
    fecha: fila.fecha instanceof Date ? fila.fecha.toISOString() : fila.fecha,
  };
}
