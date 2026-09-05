// Lista de inscritos de un evento: UNA consulta para el panel de administración
// y el de staff.
//
// Antes cada panel tenía la suya y divergían: el de admin traía talla, playera,
// perfil e integrantes del equipo; el de staff sólo nombre, correo y tipo. El
// staff que reparte playeras o recibe a un equipo en la mesa de registro no
// tenía forma de ver ni la talla ni quiénes forman el equipo.
//
// Por cada inscripción devuelve la persona (miembro/invitado) o el equipo. En
// las filas de equipo `equipo` trae el roster completo —integrantes y asesores,
// cada uno con talla, llegada y playera— como JSON agregado en la misma
// consulta, sin una petición por equipo. Con él la UI resuelve el resumen de
// tallas, el detalle del equipo y la exportación (src/lib/asistentes-resumen.js).

import { SQL_COLUMNAS_COMPROBANTE, SQL_JOIN_COMPROBANTE } from '@/lib/comprobantes-pago';

// Nombre legible de un miembro, con apellido materno opcional.
const sqlNombreMiembro = (alias) =>
  `TRIM(CONCAT(${alias}.nombre, ' ', ${alias}.apellido_paterno, ' ', COALESCE(${alias}.apellido_materno, '')))`;

// Roster del equipo. `json_agg(... ORDER BY ...)` conserva el orden: capitán
// primero y después por alta. Los asesores no tienen institución (no se les
// pide) y su talla es opcional.
const SQL_ROSTER_EQUIPO = `
        CASE WHEN eq.id_equipo IS NOT NULL THEN json_build_object(
          'integrantes', COALESCE((
            SELECT json_agg(json_build_object(
                     'id', it.id_integrante,
                     'tipo', CASE WHEN it.id_miembro IS NOT NULL THEN 'miembro' ELSE 'invitado' END,
                     'nombre', CASE WHEN tm.id_miembro IS NOT NULL THEN ${sqlNombreMiembro('tm')} ELSE ti.nombre_completo END,
                     'correo', COALESCE(tm.correo_electronico, ti.correo_electronico),
                     'institucion', CASE WHEN tm.id_miembro IS NOT NULL THEN NULL ELSE ti.escuela_institucion END,
                     'es_capitan', COALESCE(it.es_capitan, false),
                     'talla_playera', COALESCE(tm.talla_playera, ti.talla_playera),
                     'asistio', it.asistio,
                     'playera_entregada', it.playera_entregada
                   ) ORDER BY it.es_capitan DESC, it.id_integrante)
              FROM integrante_equipo it
              LEFT JOIN miembro tm ON tm.id_miembro = it.id_miembro
              LEFT JOIN invitado ti ON ti.id_invitado = it.id_invitado
             WHERE it.id_equipo = eq.id_equipo), '[]'::json),
          'asesores', COALESCE((
            SELECT json_agg(json_build_object(
                     'id', a.id_asesor,
                     'nombre', a.nombre,
                     'correo', a.correo,
                     'talla_playera', a.talla_playera,
                     'asistio', a.asistio,
                     'playera_entregada', a.playera_entregada
                   ) ORDER BY a.id_asesor)
              FROM asesor_equipo a
             WHERE a.id_equipo = eq.id_equipo), '[]'::json)
        ) END AS equipo`;

const SQL_ASISTENTES = `
      SELECT
        ie.id_inscripcion,
        ie.id_evento,
        ie.estado,
        ie.asistio,
        ie.hora_registro_asistencia,
        ie.pago_completado,
        e.tiene_costo AS requiere_pago,
        e.solicitar_talla,
        ie.fecha_inscripcion,
        -- Mesa o lugar asignado (migración 015); NULL si no hay.
        ie.mesa,
        ie.id_miembro,
        ie.id_invitado,
        ie.id_equipo,
        CASE
          WHEN m.id_miembro IS NOT NULL THEN ${sqlNombreMiembro('m')}
          WHEN i.id_invitado IS NOT NULL THEN i.nombre_completo
          WHEN eq.id_equipo IS NOT NULL THEN eq.nombre_equipo
        END AS nombre_completo,
        CASE
          WHEN m.id_miembro IS NOT NULL THEN m.correo_electronico
          WHEN i.id_invitado IS NOT NULL THEN i.correo_electronico
          -- Para un equipo, el contacto es el CAPITÁN (es a quien se le manda
          -- el correo de confirmación); el correo del asesor es opcional y casi
          -- nunca se rellena. Subconsulta escalar y no JOIN para que un dato
          -- antiguo con dos capitanes no duplique la fila.
          WHEN eq.id_equipo IS NOT NULL THEN COALESCE(
            (SELECT COALESCE(cm.correo_electronico, ci.correo_electronico)
               FROM integrante_equipo cap
               LEFT JOIN miembro cm ON cm.id_miembro = cap.id_miembro
               LEFT JOIN invitado ci ON ci.id_invitado = cap.id_invitado
              WHERE cap.id_equipo = eq.id_equipo AND cap.es_capitan = true
              LIMIT 1),
            eq.correo_asesor)
        END AS correo,
        COALESCE(m.numero_telefono, i.numero_telefono) AS telefono,
        -- Dos formas del mismo dato: 'miembro' para la lógica y 'Miembro' para
        -- las pantallas que ya lo pintaban tal cual.
        CASE
          WHEN m.id_miembro IS NOT NULL THEN 'miembro'
          WHEN i.id_invitado IS NOT NULL THEN 'invitado'
          WHEN eq.id_equipo IS NOT NULL THEN 'equipo'
        END AS tipo,
        CASE
          WHEN m.id_miembro IS NOT NULL THEN 'Miembro'
          WHEN i.id_invitado IS NOT NULL THEN 'Invitado'
          WHEN eq.id_equipo IS NOT NULL THEN 'Equipo'
        END AS tipo_usuario,
        m.numero_ieee,
        -- Datos de referencia del inscrito (los pide el formulario público).
        i.nivel_estudios,
        i.edad,
        i.escuela_institucion AS institucion,
        -- Talla de la persona. En filas de equipo las tallas van dentro de
        -- \`equipo\`, persona por persona.
        COALESCE(m.talla_playera, i.talla_playera) AS talla_playera,
        ie.playera_entregada,
        -- Conteos del equipo (migración 009): llegadas por integrante y
        -- playeras entregadas a integrantes + asesores.
        CASE WHEN eq.id_equipo IS NOT NULL
             THEN (SELECT COUNT(*)::int FROM integrante_equipo WHERE id_equipo = eq.id_equipo)
             END AS integrantes_equipo,
        CASE WHEN eq.id_equipo IS NOT NULL
             THEN (SELECT COUNT(*)::int FROM integrante_equipo WHERE id_equipo = eq.id_equipo AND asistio)
             END AS integrantes_asistieron,
        CASE WHEN eq.id_equipo IS NOT NULL
             THEN (SELECT COUNT(*)::int FROM integrante_equipo WHERE id_equipo = eq.id_equipo AND playera_entregada)
                + (SELECT COUNT(*)::int FROM asesor_equipo WHERE id_equipo = eq.id_equipo AND playera_entregada)
             END AS playeras_entregadas,
        CASE WHEN eq.id_equipo IS NOT NULL
             THEN (SELECT COUNT(*)::int FROM integrante_equipo WHERE id_equipo = eq.id_equipo)
                + (SELECT COUNT(*)::int FROM asesor_equipo WHERE id_equipo = eq.id_equipo)
             END AS personas_equipo,
        ${SQL_ROSTER_EQUIPO},
        e.nombre AS nombre_evento,
        e.fecha_inicio,
        -- Desafío elegido (migración 014). NULL en eventos sin retos y en las
        -- inscripciones anteriores a que el evento tuviera.
        ie.id_reto,
        r.titulo AS reto_titulo,
        -- Comprobante de pago (migración 013): lo que se valida desde la lista.
        ${SQL_COLUMNAS_COMPROBANTE}
      FROM inscripcion_evento ie
      JOIN evento e ON e.id_evento = ie.id_evento
      LEFT JOIN miembro m ON ie.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ie.id_invitado = i.id_invitado
      LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
      LEFT JOIN reto_evento r ON ie.id_reto = r.id_reto${SQL_JOIN_COMPROBANTE}
      WHERE ie.id_evento = $1 AND ie.estado <> 'cancelada'
      ORDER BY ie.fecha_inscripcion DESC`;

/**
 * Inscripciones vivas (no canceladas) del evento, de la más reciente a la más
 * antigua. `client` es cualquier cosa con `.query(text, values)`.
 */
export async function listarAsistentesEvento(client, idEvento) {
  const { rows } = await client.query(SQL_ASISTENTES, [Number(idEvento)]);
  return rows;
}
