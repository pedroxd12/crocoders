// Lógica de base de datos compartida por las rutas de programas recurrentes.
// Vive aquí porque estaba duplicada (o directamente ausente) en cada ruta:
// el POST generaba sesiones con su propio bucle, el PUT no generaba ninguna, y
// nadie recalculaba las estadísticas al alterar el calendario de sesiones.
//
// Todas las funciones reciben el `client` de una transacción ya abierta por la
// ruta (BEGIN/COMMIT + ROLLBACK en el catch), para que un fallo a mitad no deje
// el programa con la mitad de sus sesiones.

import { aFechaISO } from './programas-fechas';

/**
 * Valida el array `dias_semana` del cuerpo de la petición.
 * Devuelve un mensaje de error o null si es válido.
 */
export function validarDiasSemana(diasSemana) {
  if (diasSemana == null) return null;
  if (!Array.isArray(diasSemana) ||
      !diasSemana.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return 'dias_semana debe ser una lista de enteros entre 0 (Domingo) y 6 (Sábado).';
  }
  return null;
}

/**
 * Materializa las sesiones del programa para los días de la semana indicados,
 * SIN crear eventos espejo en el catálogo público.
 *
 * No duplica: salta las fechas que ya tienen una sesión (las conservadas al
 * regenerar, que son justo las que ya tienen asistencia registrada).
 *
 * `titulo` y `descripcion` se dejan en NULL a propósito: antes se clonaba la
 * descripción completa del programa en CADA sesión y el título era "Sesión N",
 * repitiendo lo que la propia columna "#" ya muestra.
 *
 * Devuelve el número de sesiones creadas.
 */
export async function generarSesiones(client, {
  programaId,
  fechaInicio,
  fechaFin,
  diasSemana,
  horaInicio,
  horaFin,
  ubicacion,
}) {
  if (!Array.isArray(diasSemana) || diasSemana.length === 0) return 0;
  if (!horaInicio || !horaFin) return 0;

  const inicio = aFechaISO(fechaInicio);
  const fin = aFechaISO(fechaFin);
  if (!inicio || !fin) return 0;

  // Fechas ya ocupadas y siguiente número libre (el UNIQUE es (id_programa, numero_sesion)).
  const existentes = await client.query(
    `SELECT TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, numero_sesion
       FROM sesion_programa
      WHERE id_programa = $1`,
    [programaId],
  );
  const fechasOcupadas = new Set(existentes.rows.map((r) => r.fecha).filter(Boolean));
  let numero = existentes.rows.reduce((max, r) => Math.max(max, r.numero_sesion || 0), 0) + 1;

  // Las fechas se recorren en UTC para que getUTCDay() dé el día correcto en
  // cualquier servidor, sin importar su zona horaria.
  const desde = new Date(`${inicio}T00:00:00Z`);
  const hasta = new Date(`${fin}T00:00:00Z`);

  let creadas = 0;
  for (let d = new Date(desde); d <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!diasSemana.includes(d.getUTCDay())) continue;

    const fechaStr = d.toISOString().split('T')[0];
    if (fechasOcupadas.has(fechaStr)) continue;

    await client.query(
      `INSERT INTO sesion_programa (
        id_programa, numero_sesion, titulo, descripcion,
        fecha, hora_inicio, hora_fin, ubicacion, es_obligatoria
      ) VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, TRUE)`,
      [programaId, numero, fechaStr, horaInicio, horaFin, ubicacion || null],
    );

    fechasOcupadas.add(fechaStr);
    numero++;
    creadas++;
  }

  if (creadas > 0) await renumerarSesiones(client, programaId);
  return creadas;
}

/**
 * Renumera las sesiones por fecha para que el "#" de la tabla sea coherente
 * después de regenerar o borrar. Se hace en dos pasos (a negativo y de vuelta)
 * porque el UNIQUE (id_programa, numero_sesion) no es diferible y un cambio
 * directo chocaría con los números que aún no se han reasignado.
 */
export async function renumerarSesiones(client, programaId) {
  await client.query(
    `WITH ordenadas AS (
       SELECT id_sesion, ROW_NUMBER() OVER (ORDER BY fecha NULLS LAST, id_sesion) AS n
         FROM sesion_programa WHERE id_programa = $1
     )
     UPDATE sesion_programa sp
        SET numero_sesion = -o.n
       FROM ordenadas o
      WHERE sp.id_sesion = o.id_sesion`,
    [programaId],
  );
  await client.query(
    `UPDATE sesion_programa SET numero_sesion = -numero_sesion
      WHERE id_programa = $1 AND numero_sesion < 0`,
    [programaId],
  );
}

/**
 * Borra las sesiones del programa que NO tienen ninguna asistencia registrada.
 * Las que sí la tienen se conservan siempre: son el historial del participante
 * y borrarlas falsearía su porcentaje.
 *
 * Devuelve { borradas, conservadas }.
 */
export async function borrarSesionesSinAsistencia(client, programaId) {
  const conservadasRes = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM sesion_programa sp
      WHERE sp.id_programa = $1
        AND (EXISTS (SELECT 1 FROM asistencia_miembro  am WHERE am.id_sesion = sp.id_sesion)
          OR EXISTS (SELECT 1 FROM asistencia_invitado ai WHERE ai.id_sesion = sp.id_sesion))`,
    [programaId],
  );
  const borradasRes = await client.query(
    `DELETE FROM sesion_programa sp
      WHERE sp.id_programa = $1
        AND NOT EXISTS (SELECT 1 FROM asistencia_miembro  am WHERE am.id_sesion = sp.id_sesion)
        AND NOT EXISTS (SELECT 1 FROM asistencia_invitado ai WHERE ai.id_sesion = sp.id_sesion)`,
    [programaId],
  );
  return { borradas: borradasRes.rowCount, conservadas: conservadasRes.rows[0].n };
}

/** Cuántas sesiones quedarían fuera del rango de fechas indicado. */
export async function contarSesionesFueraDeRango(client, programaId, fechaInicio, fechaFin) {
  const res = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM sesion_programa
      WHERE id_programa = $1
        AND fecha IS NOT NULL
        AND (fecha < $2::date OR fecha > $3::date)`,
    [programaId, fechaInicio, fechaFin],
  );
  return res.rows[0].n;
}

/**
 * Recalcula `sesiones_asistidas`, `porcentaje_asistencia` y `elegible_certificado`
 * de TODAS las inscripciones del programa.
 *
 * Hace falta porque los triggers de estadísticas cuelgan de `asistencia_miembro`
 * y `asistencia_invitado`, no de `sesion_programa`: al añadir o borrar una sesión
 * cambia el denominador (sesiones obligatorias) y nadie actualizaba las columnas
 * persistidas, que son las que se congelan al acreditar a un participante.
 *
 * No toca `certificado_emitido` ni `fecha_certificado`: eso lo decide el admin.
 */
export async function recalcularEstadisticasPrograma(client, programaId) {
  await client.query(
    `WITH sesiones AS (
       SELECT COUNT(*) FILTER (WHERE es_obligatoria)::int AS total_oblig
         FROM sesion_programa WHERE id_programa = $1
     ),
     prog AS (
       SELECT COALESCE(sesiones_requeridas_certificado, 0) AS requeridas,
              COALESCE(porcentaje_asistencia_minimo, 80)   AS pct_minimo
         FROM programa_recurrente WHERE id_programa = $1
     ),
     asis AS (
       SELECT ip.id_inscripcion_programa,
              COALESCE((
                SELECT COUNT(*) FROM asistencia_miembro am
                  JOIN sesion_programa sp ON sp.id_sesion = am.id_sesion
                 WHERE sp.id_programa = $1 AND sp.es_obligatoria
                   AND am.id_miembro = ip.id_miembro AND am.asistio
              ), 0)::int
              + COALESCE((
                SELECT COUNT(*) FROM asistencia_invitado ai
                  JOIN sesion_programa sp ON sp.id_sesion = ai.id_sesion
                 WHERE sp.id_programa = $1 AND sp.es_obligatoria
                   AND ai.id_invitado = ip.id_invitado AND ai.asistio
              ), 0)::int AS asistidas
         FROM inscripcion_programa ip
        WHERE ip.id_programa = $1
     )
     UPDATE inscripcion_programa ip
        SET sesiones_asistidas = a.asistidas,
            porcentaje_asistencia = CASE WHEN s.total_oblig > 0
                                         THEN ROUND(100.0 * a.asistidas / s.total_oblig, 2)
                                         ELSE 0 END,
            -- La división va con NULLIF porque el AND de SQL no garantiza el
            -- cortocircuito: un programa que se queda sin sesiones obligatorias
            -- (al borrar la última) podía reventar con "division by zero" en vez
            -- de marcar a todos como no elegibles.
            elegible_certificado = (
              a.asistidas >= p.requeridas
              AND s.total_oblig > 0
              AND (100.0 * a.asistidas / NULLIF(s.total_oblig, 0)) >= p.pct_minimo
            ),
            updated_at = NOW()
       FROM asis a, sesiones s, prog p
      WHERE ip.id_inscripcion_programa = a.id_inscripcion_programa`,
    [programaId],
  );
}
