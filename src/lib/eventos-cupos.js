// Contabilidad de cupos de eventos: UNA sola fuente de verdad.
//
// UNIDAD DEL AFORO
// ----------------
// `evento.cupos` cuenta INSCRIPCIONES: en un concurso por equipos una
// inscripción es un equipo (un equipo de 3 ocupa 1 cupo), en el resto es una
// persona. Ver src/lib/aforo.js. Hasta la migración 015 un equipo consumía
// tantos lugares como integrantes, y un hackatón con cupo para 40 equipos se
// cerraba con 13. Como ahora TODA inscripción viva ocupa exactamente un cupo,
// la ocupación es un COUNT(*) y coincide, de paso, con lo que descuenta el
// trigger `trigger_actualizar_cupos` de la base (±1 por inscripción).
//
// AFORO DERIVADO DE LOS DESAFÍOS
// ------------------------------
// Si el evento reparte por desafíos y TODOS los activos tienen cupo, el aforo
// del evento es la suma de esos cupos (más las inscripciones vivas de los
// desafíos retirados, que siguen ocupando su sitio). `recalcularCupos` lo
// reescribe en `evento.cupos` cada vez que algo cambia, así que el panel, la
// web y el registro leen siempre el mismo número. Si algún desafío activo no
// tiene cupo, `evento.cupos` es el tope global que fijó administración.
//
// `cupos_disponibles` queda degradado a caché: se RECALCULA desde las
// inscripciones reales en un único sitio —`recalcularCupos()`— al final de
// toda operación que las toque (registro público, baja, registro del admin,
// edición del evento, alta/edición/baja de desafíos y la reconciliación manual
// del panel). Nadie más debe sumar ni restar cupos a mano.

// Una inscripción reserva su cupo mientras no esté cancelada: 'pendiente'
// (pago sin verificar) también ocupa, porque la plaza está apartada.
const ESTADOS_QUE_OCUPAN = "ie.estado <> 'cancelada'";

/**
 * Inscripciones vivas del evento como subconsulta escalar (`alias` es el de la
 * tabla `evento`). La usan los listados y detalles de admin, staff y público
 * para que todos digan el mismo número.
 */
export const sqlLugaresOcupados = (alias = 'e') => `(
          SELECT COUNT(*)::int
            FROM inscripcion_evento ie
           WHERE ie.id_evento = ${alias}.id_evento AND ${ESTADOS_QUE_OCUPAN}
        )`;

/**
 * Aforo derivado de los desafíos como subconsulta escalar (NULL si el evento no
 * tiene desafíos activos o alguno de ellos no tiene cupo).
 */
export const sqlCupoPorRetos = (alias = 'e') => `(
          SELECT CASE
                   WHEN COUNT(*) FILTER (WHERE r.activo) > 0
                    AND COUNT(*) FILTER (WHERE r.activo AND r.cupo_equipos IS NULL) = 0
                   THEN COALESCE(SUM(r.cupo_equipos) FILTER (WHERE r.activo), 0)::int
                      + (SELECT COUNT(*)::int
                           FROM inscripcion_evento ie
                           JOIN reto_evento ri ON ri.id_reto = ie.id_reto
                          WHERE ri.id_evento = ${alias}.id_evento
                            AND NOT ri.activo
                            AND ${ESTADOS_QUE_OCUPAN})
                   ELSE NULL
                 END
            FROM reto_evento r
           WHERE r.id_evento = ${alias}.id_evento
        )`;

/**
 * Inscripciones vivas del evento. Es el número que manda: cualquier otra
 * cifra se deriva de éste.
 * @param {import('pg').PoolClient} client
 * @param {number|string} idEvento
 * @returns {Promise<number>}
 */
export async function contarLugaresOcupados(client, idEvento) {
  const res = await client.query(
    `SELECT COUNT(*)::int AS ocupados
       FROM inscripcion_evento ie
      WHERE ie.id_evento = $1 AND ${ESTADOS_QUE_OCUPAN}`,
    [idEvento],
  );
  return res.rows[0]?.ocupados ?? 0;
}

/**
 * Aforo que dictan los desafíos, o null si no aplica (ver cabecera).
 * @returns {Promise<number|null>}
 */
export async function derivarCupoDeRetos(client, idEvento) {
  const res = await client.query(
    `SELECT ${sqlCupoPorRetos('e')} AS cupo_por_retos
       FROM evento e WHERE e.id_evento = $1`,
    [idEvento],
  );
  const valor = res.rows[0]?.cupo_por_retos;
  return valor == null ? null : Number(valor);
}

/**
 * Reescribe `cupos` (si lo dictan los desafíos) y `cupos_disponibles` a partir
 * de las inscripciones reales. Llamar SIEMPRE dentro de la transacción que
 * acaba de tocar inscripciones o desafíos y con la fila del evento bloqueada
 * (`SELECT ... FOR UPDATE`), para que dos registros simultáneos no se pisen.
 *
 * - `cupos IS NULL` significa aforo ilimitado: `cupos_disponibles` queda NULL.
 * - Si hay sobrecupo (el admin forzó inscripciones por encima del aforo), el
 *   valor se satura en 0 en vez de volverse negativo.
 *
 * @returns {Promise<{cupos: number|null, cupos_disponibles: number|null, lugares_ocupados: number, cupo_por_retos: number|null}>}
 */
export async function recalcularCupos(client, idEvento) {
  const cupoPorRetos = await derivarCupoDeRetos(client, idEvento);
  if (cupoPorRetos != null) {
    await client.query(
      'UPDATE evento SET cupos = $2 WHERE id_evento = $1 AND cupos IS DISTINCT FROM $2',
      [idEvento, cupoPorRetos],
    );
  }

  const ocupados = await contarLugaresOcupados(client, idEvento);
  const res = await client.query(
    `UPDATE evento
        SET cupos_disponibles = CASE
              WHEN cupos IS NULL THEN NULL
              ELSE GREATEST(0, cupos - $2)
            END
      WHERE id_evento = $1
      RETURNING cupos, cupos_disponibles`,
    [idEvento, ocupados],
  );
  const fila = res.rows[0] || { cupos: null, cupos_disponibles: null };
  return { ...fila, lugares_ocupados: ocupados, cupo_por_retos: cupoPorRetos };
}

/**
 * ¿Cabe una inscripción más en el evento?
 * Se resuelve contra las inscripciones reales, NO contra el contador: es la
 * única comprobación fiable mientras `cupos_disponibles` pueda venir desfasado
 * de datos antiguos. `cupos === null` = aforo ilimitado, siempre cabe.
 *
 * @returns {Promise<{cabe: boolean, cupos: number|null, ocupados: number, libres: number|null}>}
 */
export async function verificarDisponibilidad(client, idEvento, cupos) {
  const ocupados = await contarLugaresOcupados(client, idEvento);
  if (cupos === null || cupos === undefined) {
    return { cabe: true, cupos: null, ocupados, libres: null };
  }
  const total = Number(cupos);
  const libres = Math.max(0, total - ocupados);
  return { cabe: libres >= 1, cupos: total, ocupados, libres };
}
