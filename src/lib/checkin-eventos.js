// src/lib/checkin-eventos.js
// Piezas compartidas del check-in por QR entre /api/eventos/verify-qr (el
// escaneo) y /api/eventos/checkin (los toggles de asistencia / entrega de
// playera que el staff marca desde el panel del escáner).

import { sqlFinEvento } from '@/lib/eventos-fechas';

/**
 * Autorización por evento: un administrador puede todo en cualquier evento; el
 * staff sólo en los eventos donde está asignado Y con un rol del nivel
 * pedido (ver src/lib/roles-staff.js, que define qué significa cada bandera
 * de `catalogo_rol_staff`):
 *
 *   nivel 'operacion' (por defecto)  puede_editar o puede_administrar
 *                                    → escáner QR, llegadas, playeras, comprobantes
 *   nivel 'gestion'                  puede_administrar
 *                                    → marcar asistencia y pago a mano desde la lista
 *
 * Una asignación cuyo rol ya no existe en el catálogo (LEFT JOIN sin fila) se
 * trata como operación: negarla dejaría fuera al staff ya asignado. Para
 * gestión se exige la bandera explícita.
 *
 * Devuelve `{ ok: true }` o `{ ok: false, error, status }`. NO abre ni cierra
 * transacción: el que llama decide.
 */
export async function autorizarStaffEvento(client, session, eventoId, { nivel = 'operacion' } = {}) {
  const role = (session.role || '').toLowerCase();
  if (role === 'administrador') return { ok: true };

  const staffRes = await client.query(
    `SELECT r.puede_administrar, r.puede_editar
       FROM staff_evento se
       LEFT JOIN catalogo_rol_staff r ON se.id_rol = r.id_rol
      WHERE se.id_evento = $1 AND se.id_miembro = $2`,
    [eventoId, Number(session.id)],
  );
  if (staffRes.rows.length === 0) {
    return {
      ok: false,
      status: 403,
      error: 'No estás asignado como staff de este evento.',
    };
  }

  const exigeGestion = nivel === 'gestion';
  const autorizado = staffRes.rows.some((r) =>
    exigeGestion
      ? r.puede_administrar === true
      : r.puede_administrar === null || r.puede_administrar || r.puede_editar,
  );
  if (!autorizado) {
    return {
      ok: false,
      status: 403,
      error: exigeGestion
        ? 'Tu rol en este evento no permite modificar la lista a mano; usa el escáner QR o pide a un administrador.'
        : 'Tu rol en este evento es de solo consulta; no puedes registrar asistencia ni validar pagos.',
    };
  }
  return { ok: true };
}

/**
 * Carga la inscripción del ticket con todo lo que el check-in necesita:
 * datos del evento (talla, costo, vencimiento del ticket), la persona (o el
 * equipo) y el estado de asistencia/playera. Devuelve la fila o null.
 */
export async function cargarInscripcionCheckin(client, inscripcionId, eventoId) {
  const res = await client.query(
    `SELECT
        ie.id_inscripcion,
        ie.id_evento,
        ie.id_miembro,
        ie.id_invitado,
        ie.id_equipo,
        ie.estado,
        ie.asistio,
        ie.hora_registro_asistencia,
        ie.pago_completado,
        ie.playera_entregada,
        ie.hora_entrega_playera,
        ie.mesa,
        e.tiene_costo,
        e.solicitar_talla,
        e.nombre AS nombre_evento,
        e.fecha_inicio,
        -- El ticket vale hasta 6 h después del fin del evento (margen para el
        -- cierre). Comparado en SQL con la zona fija del club, no en JS.
        ((${sqlFinEvento('e')} + INTERVAL '6 hours') < NOW()) AS ticket_vencido,
        CASE
          WHEN m.id_miembro IS NOT NULL THEN TRIM(CONCAT(m.nombre, ' ', m.apellido_paterno, ' ', COALESCE(m.apellido_materno, '')))
          WHEN i.id_invitado IS NOT NULL THEN i.nombre_completo
          WHEN eq.id_equipo IS NOT NULL THEN eq.nombre_equipo
        END AS nombre_completo,
        COALESCE(m.correo_electronico, i.correo_electronico) AS correo,
        COALESCE(m.talla_playera, i.talla_playera) AS talla_playera,
        CASE
          WHEN m.id_miembro IS NOT NULL THEN 'miembro'
          WHEN i.id_invitado IS NOT NULL THEN 'invitado'
          WHEN eq.id_equipo IS NOT NULL THEN 'equipo'
        END AS tipo
      FROM inscripcion_evento ie
      JOIN evento e ON ie.id_evento = e.id_evento
      LEFT JOIN miembro m ON ie.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ie.id_invitado = i.id_invitado
      LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
      WHERE ie.id_inscripcion = $1 AND ie.id_evento = $2`,
    [inscripcionId, eventoId],
  );
  return res.rows[0] ?? null;
}

/**
 * Roster completo de un equipo para el panel del escáner: integrantes (con
 * talla y capitán primero) y asesores, cada uno con su asistencia y su entrega
 * de playera.
 */
export async function cargarRosterEquipo(client, idEquipo) {
  const [integrantesRes, asesoresRes] = await Promise.all([
    client.query(
      `SELECT
          it.id_integrante,
          it.es_capitan,
          it.asistio,
          it.hora_asistencia,
          it.playera_entregada,
          it.hora_entrega_playera,
          CASE
            WHEN m.id_miembro IS NOT NULL THEN TRIM(CONCAT(m.nombre, ' ', m.apellido_paterno, ' ', COALESCE(m.apellido_materno, '')))
            ELSE i.nombre_completo
          END AS nombre,
          COALESCE(m.correo_electronico, i.correo_electronico) AS correo,
          COALESCE(m.talla_playera, i.talla_playera) AS talla_playera
        FROM integrante_equipo it
        LEFT JOIN miembro m ON m.id_miembro = it.id_miembro
        LEFT JOIN invitado i ON i.id_invitado = it.id_invitado
       WHERE it.id_equipo = $1
       ORDER BY it.es_capitan DESC, it.id_integrante`,
      [idEquipo],
    ),
    client.query(
      `SELECT id_asesor, nombre, correo, talla_playera, asistio, hora_asistencia,
              playera_entregada, hora_entrega_playera
         FROM asesor_equipo
        WHERE id_equipo = $1
        ORDER BY id_asesor`,
      [idEquipo],
    ),
  ]);
  return { integrantes: integrantesRes.rows, asesores: asesoresRes.rows };
}
