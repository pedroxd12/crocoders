// Datos de la landing del HackaItlac, leídos del sistema de eventos.
//
// POR QUÉ EXISTE
// --------------
// Los cinco desafíos vivían escritos a mano dentro de HackaitlacLanding.jsx:
// publicar uno nuevo, corregir una fecha o cerrar un cupo exigía tocar código y
// desplegar, y el botón de "registrar equipo" era un `mailto:` que no reservaba
// nada. Ahora la landing lee el EVENTO del panel —el que tenga
// `evento.slug = 'hackaitlac'`— y sus retos (migración 014), así que un
// administrador publica desafíos, les pone cupo e imagen desde /admin/eventos y
// el registro pasa por el mismo flujo (y los mismos cupos) que el resto.
//
// Si no hay ningún evento con ese slug, la página cae al contenido de respaldo
// (src/components/hackaitlac/desafios-fallback.js): la convocatoria sigue
// visible en lugar de quedarse en blanco.

import { query } from '@/lib/db-server';
import { ZONA_EVENTOS, sqlRegistroCerrado, sqlEventoTerminado } from '@/lib/eventos-fechas';
import { listarRetos } from '@/lib/retos';

const SQL_EVENTO_POR_SLUG = `
  SELECT
    e.id_evento,
    e.nombre,
    e.fecha_inicio,
    e.fecha_fin,
    e.hora_inicio,
    e.hora_fin,
    e.ubicacion,
    e.cupos,
    e.estado,
    e.tiene_costo,
    e.costo,
    (e.fecha_limite_registro AT TIME ZONE '${ZONA_EVENTOS}') AS fecha_limite_registro,
    ${sqlRegistroCerrado('e')} AS registro_cerrado,
    ${sqlEventoTerminado('e')} AS evento_terminado,
    c.modalidad,
    c.min_integrantes_equipo,
    c.max_integrantes_equipo,
    c.requiere_asesor,
    c.asesor_participa,
    (
      SELECT COALESCE(SUM(
               CASE WHEN ie.id_equipo IS NOT NULL
                    THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = ie.id_equipo)
                    ELSE 1 END
             ), 0)::int
      FROM inscripcion_evento ie
      WHERE ie.id_evento = e.id_evento AND ie.estado <> 'cancelada'
    ) AS lugares_ocupados
  FROM evento e
  LEFT JOIN concurso c ON e.id_evento = c.id_evento
  WHERE e.slug = $1
    AND e.deleted_at IS NULL
    AND e.estado IN ('publicado', 'en_curso', 'finalizado')
  LIMIT 1
`;

const aDia = (v) => (v instanceof Date ? v.toISOString().split('T')[0] : v ?? null);

/**
 * Convierte un reto de la base en la forma que consumen las tarjetas de la
 * landing. Los nombres de campo (`title`, `lede`, `body`, `criteria`) son los
 * que ya usaban las tarjetas escritas a mano: así el componente no distingue
 * entre el contenido de respaldo y el que viene del panel.
 *
 * @param {object} reto  fila normalizada por src/lib/retos.js
 * @param {number} i     posición en la lista (da el número 01, 02…)
 * @param {number|null} idEvento  para armar el enlace al registro
 */
export function retoATarjeta(reto, i, idEvento) {
  return {
    id: reto.slug,
    idReto: reto.id_reto,
    tone: reto.tono,
    index: String(i + 1).padStart(2, '0'),
    title: reto.titulo,
    lede: reto.lede || '',
    resumen: reto.resumen || '',
    body: reto.descripcion || '',
    entregable: reto.entregable || '',
    patrocinador: reto.patrocinador || '',
    premio: reto.premio || '',
    tags: reto.tags,
    criteria: reto.criterios,
    imagen: reto.imagen_url || null,
    cupo: reto.cupo_equipos,
    ocupados: reto.equipos_ocupados,
    disponibles: reto.equipos_disponibles,
    lleno: reto.lleno,
    // Registro real: el mismo formulario y los mismos cupos que /eventos.
    href: idEvento ? `/eventos/${idEvento}?reto=${encodeURIComponent(reto.slug)}` : null,
  };
}

/**
 * Evento + desafíos de la landing. Devuelve `null` si no hay ningún evento con
 * ese slug publicado; quien llama decide entonces qué enseñar.
 *
 * @param {string} slug  identificador del evento (por defecto 'hackaitlac')
 */
export async function obtenerLandingEvento(slug = 'hackaitlac') {
  const res = await query(SQL_EVENTO_POR_SLUG, [slug]);
  if (res.rows.length === 0) return null;

  const fila = res.rows[0];
  const idEvento = Number(fila.id_evento);

  // `query()` de db-server (con reintentos); nunca pool.query() directo.
  const retos = await listarRetos(
    { query: (text, values) => query(text, values) },
    idEvento,
    { soloActivos: true },
  );

  const cupos = fila.cupos === null ? null : Number(fila.cupos);
  const ocupados = Number(fila.lugares_ocupados) || 0;

  // Todo lo que sale de aquí viaja como props de un Server Component, así que
  // tiene que ser serializable: nada de `Date` ni de numéricos de `pg`.
  return {
    evento: {
      id_evento: idEvento,
      nombre: fila.nombre,
      fecha_inicio: aDia(fila.fecha_inicio),
      fecha_fin: aDia(fila.fecha_fin),
      hora_inicio: fila.hora_inicio?.toString?.() ?? null,
      hora_fin: fila.hora_fin?.toString?.() ?? null,
      ubicacion: fila.ubicacion || null,
      estado: fila.estado,
      cupos,
      lugares_ocupados: ocupados,
      lugares_libres: cupos === null ? null : Math.max(0, cupos - ocupados),
      tiene_costo: Boolean(fila.tiene_costo),
      costo: fila.costo === null ? null : Number(fila.costo),
      fecha_limite_registro:
        fila.fecha_limite_registro instanceof Date
          ? fila.fecha_limite_registro.toISOString()
          : fila.fecha_limite_registro,
      registro_cerrado: Boolean(fila.registro_cerrado),
      evento_terminado: Boolean(fila.evento_terminado),
      modalidad: fila.modalidad || null,
      min_integrantes_equipo: fila.min_integrantes_equipo ?? null,
      max_integrantes_equipo: fila.max_integrantes_equipo ?? null,
      requiere_asesor: Boolean(fila.requiere_asesor),
      asesor_participa: Boolean(fila.asesor_participa),
      url_registro: `/eventos/${idEvento}`,
    },
    challenges: retos.map((reto, i) => retoATarjeta(reto, i, idEvento)),
  };
}
