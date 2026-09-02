// Contabilidad de cupos de eventos: UNA sola fuente de verdad.
//
// POR QUÉ EXISTE ESTE MÓDULO
// --------------------------
// `evento.cupos_disponibles` es un contador denormalizado que mantiene el
// trigger `trigger_actualizar_cupos` de la base de datos. Ese trigger cuenta
// FILAS de `inscripcion_evento` (±1) y sólo reacciona al estado 'confirmada'.
// Pero una inscripción de equipo es UNA fila que ocupa N lugares, y las
// inscripciones 'pendiente' (eventos con costo) no mueven el contador. Encima,
// el código sumaba y restaba cupos a mano en cuatro sitios distintos con reglas
// distintas. Resultado real observado en producción: un evento con cupos=150,
// cupos_disponibles=147 y UNA sola inscripción confirmada, sin forma de repararlo.
//
// DECISIÓN (documentada aquí a propósito, para que no vuelva a divergir):
// la VERDAD son las inscripciones reales de la tabla `inscripcion_evento`.
// `cupos_disponibles` queda degradado a caché: se RECALCULA desde esas
// inscripciones en un único sitio —`recalcularCupos()`— al final de toda
// operación que las toque (registro público, baja, registro forzado del admin,
// edición del aforo y la reconciliación manual del panel). Da igual lo que el
// trigger haya hecho antes dentro de la misma transacción: el valor que queda
// escrito es siempre el derivado. Nadie más debe sumar ni restar cupos a mano.
//
// UNIDAD: "lugares". Un miembro o un invitado ocupan 1 lugar; un equipo ocupa
// tantos lugares como integrantes tenga. No confundir con "inscripciones",
// que son filas (un equipo de 3 es 1 inscripción y 3 lugares).

// Una inscripción reserva su lugar mientras no esté cancelada: 'pendiente'
// (pago sin verificar) también ocupa, porque la plaza está apartada.
// 'cancelada' es lo único que libera.
const ESTADOS_QUE_OCUPAN = "ie.estado <> 'cancelada'";

/**
 * La misma cuenta que `contarLugaresOcupados`, como subconsulta escalar para
 * incrustar en un SELECT de eventos (`alias` es el de la tabla `evento`). La
 * usan los detalles de evento del panel admin y del panel de staff para que
 * los dos digan el mismo número.
 */
export const sqlLugaresOcupados = (alias = 'e') => `(
          SELECT COALESCE(SUM(
                   CASE WHEN ie.id_equipo IS NOT NULL
                        THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = ie.id_equipo)
                        ELSE 1 END
                 ), 0)::int
            FROM inscripcion_evento ie
           WHERE ie.id_evento = ${alias}.id_evento AND ${ESTADOS_QUE_OCUPAN}
        )`;

/**
 * Lugares realmente ocupados en un evento, contando los integrantes de cada
 * equipo. Es el número que manda: cualquier otra cifra se deriva de éste.
 * @param {import('pg').PoolClient} client
 * @param {number|string} idEvento
 * @returns {Promise<number>}
 */
export async function contarLugaresOcupados(client, idEvento) {
  const res = await client.query(
    `SELECT COALESCE(SUM(
              CASE WHEN ie.id_equipo IS NOT NULL
                   THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = ie.id_equipo)
                   ELSE 1 END
            ), 0)::int AS ocupados
       FROM inscripcion_evento ie
      WHERE ie.id_evento = $1 AND ${ESTADOS_QUE_OCUPAN}`,
    [idEvento],
  );
  return res.rows[0]?.ocupados ?? 0;
}

/**
 * Reescribe `cupos_disponibles` a partir de las inscripciones reales.
 * Llamar SIEMPRE dentro de la transacción que acaba de tocar inscripciones y
 * con la fila del evento bloqueada (`SELECT ... FOR UPDATE`), para que dos
 * registros simultáneos no se pisen.
 *
 * - `cupos IS NULL` significa aforo ilimitado: `cupos_disponibles` queda NULL.
 * - Si hay sobrecupo (el admin forzó inscripciones por encima del aforo), el
 *   valor se satura en 0 en vez de volverse negativo. Esto también elimina los
 *   "cupos fantasma": el trigger devolvía +1 sin tope al cancelar una
 *   inscripción forzada, inflando el contador de un evento que seguía lleno.
 *
 * @returns {Promise<{cupos: number|null, cupos_disponibles: number|null, lugares_ocupados: number}>}
 */
export async function recalcularCupos(client, idEvento) {
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
  return { ...fila, lugares_ocupados: ocupados };
}

/**
 * ¿Caben `lugaresSolicitados` lugares más en el evento?
 * Se resuelve contra las inscripciones reales, NO contra el contador: es la
 * única comprobación fiable mientras `cupos_disponibles` pueda venir desfasado
 * de datos antiguos.
 *
 * `cupos === null` = aforo ilimitado, siempre caben.
 *
 * @returns {Promise<{cabe: boolean, cupos: number|null, ocupados: number, libres: number|null}>}
 */
export async function verificarDisponibilidad(client, idEvento, cupos, lugaresSolicitados = 1) {
  if (cupos === null || cupos === undefined) {
    return { cabe: true, cupos: null, ocupados: await contarLugaresOcupados(client, idEvento), libres: null };
  }
  const total = Number(cupos);
  const ocupados = await contarLugaresOcupados(client, idEvento);
  const libres = Math.max(0, total - ocupados);
  return { cabe: lugaresSolicitados <= libres, cupos: total, ocupados, libres };
}
