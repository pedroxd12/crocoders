// API para verificar el ticket QR de un PROGRAMA y registrar la asistencia de
// UNA SESIÓN concreta.
//
// El ticket es único por inscripción (payload { id, pid, ts }, ver qr-token.js)
// y sirve durante todo el programa: el escáner se abre desde la pantalla de
// asistencia de una sesión y `sesionId` dice cuál se está pasando lista. La
// primera lectura de esa sesión marca la asistencia (upsert en
// asistencia_miembro/asistencia_invitado, el mismo almacén que usa el panel y
// del que se calculan los certificados); las siguientes responden
// alreadyRegistered. La respuesta trae talla y estado de entrega de playera
// (una por participante en todo el programa, migración 010).
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { verificarQrTokenPrograma } from '@/lib/qr-token';
import { ZONA_EVENTOS } from '@/lib/eventos-fechas';

// Tolerancia frente a relojes desincronizados / sellos generados ligeramente en el "futuro".
const QR_FUTURE_SKEW_MS = 5 * 60 * 1000;

export async function POST(request) {
  // La asistencia de programas la administra el panel (no hay staff por
  // programa como staff_evento): mismo gate que el resto de sus endpoints.
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;

  try {
    const { qrToken, sesionId, programaId: programaEsperado } = await request.json();

    if (!qrToken) {
      return NextResponse.json({ success: false, error: 'Token QR requerido' }, { status: 400 });
    }
    const idSesion = Number(sesionId);
    if (!Number.isInteger(idSesion) || idSesion <= 0) {
      return NextResponse.json(
        { success: false, error: 'Falta la sesión a la que se pasa lista' },
        { status: 400 },
      );
    }

    const secret = process.env.PAYLOAD_SECRET;
    if (!secret) {
      console.error('PAYLOAD_SECRET no configurado');
      return NextResponse.json({ success: false, error: 'Servidor mal configurado' }, { status: 500 });
    }

    const qrData = verificarQrTokenPrograma(qrToken, secret);
    if (!qrData) {
      return NextResponse.json(
        { success: false, error: 'Token QR inválido o manipulado' },
        { status: 401 },
      );
    }
    const { id: inscripcionId, pid: programaId, ts } = qrData;

    if (programaEsperado != null && Number(programaEsperado) !== programaId) {
      return NextResponse.json(
        { success: false, error: 'Este ticket pertenece a otro programa.' },
        { status: 400 },
      );
    }
    if (ts > Date.now() + QR_FUTURE_SKEW_MS) {
      return NextResponse.json(
        { success: false, error: 'QR con fecha futura inválida' },
        { status: 400 },
      );
    }

    try {
      client = await connectWithRetry();
    } catch (connectionError) {
      console.error('Error de conexión en /api/programas/verify-qr:', connectionError);
      return NextResponse.json(
        { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }

    // La sesión tiene que ser del programa del ticket: así un QR válido no
    // marca lista en otro curso aunque el cliente mande cualquier sesionId.
    const sesionRes = await client.query(
      `SELECT id_sesion, numero_sesion, titulo, fecha
         FROM sesion_programa
        WHERE id_sesion = $1 AND id_programa = $2`,
      [idSesion, programaId],
    );
    if (sesionRes.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'La sesión no corresponde al programa de este ticket.' },
        { status: 400 },
      );
    }
    const sesion = sesionRes.rows[0];

    const inscripcionRes = await client.query(
      `SELECT
          ip.id_inscripcion_programa,
          ip.id_miembro,
          ip.id_invitado,
          ip.estado,
          ip.playera_entregada,
          ip.hora_entrega_playera,
          p.nombre AS nombre_programa,
          p.solicitar_talla,
          -- El ticket vale hasta 6 h después del último día del programa
          -- (fecha_fin es DATE: fin del día = +24 h, margen = +6 h).
          (((p.fecha_fin + INTERVAL '30 hours') AT TIME ZONE '${ZONA_EVENTOS}') < NOW()) AS ticket_vencido,
          CASE
            WHEN m.id_miembro IS NOT NULL THEN TRIM(CONCAT(m.nombre, ' ', m.apellido_paterno, ' ', COALESCE(m.apellido_materno, '')))
            ELSE i.nombre_completo
          END AS nombre_completo,
          COALESCE(m.correo_electronico, i.correo_electronico) AS correo,
          COALESCE(m.talla_playera, i.talla_playera) AS talla_playera,
          CASE WHEN ip.id_miembro IS NOT NULL THEN 'miembro' ELSE 'invitado' END AS tipo
        FROM inscripcion_programa ip
        JOIN programa_recurrente p ON p.id_programa = ip.id_programa
        LEFT JOIN miembro m ON m.id_miembro = ip.id_miembro
        LEFT JOIN invitado i ON i.id_invitado = ip.id_invitado
        WHERE ip.id_inscripcion_programa = $1 AND ip.id_programa = $2`,
      [inscripcionId, programaId],
    );
    if (inscripcionRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Inscripción no encontrada' }, { status: 404 });
    }
    const inscripcion = inscripcionRes.rows[0];

    if (inscripcion.estado === 'cancelada') {
      return NextResponse.json(
        { success: false, error: 'La inscripción fue cancelada; no se puede registrar asistencia.' },
        { status: 400 },
      );
    }
    if (inscripcion.ticket_vencido) {
      return NextResponse.json(
        { success: false, error: 'Este ticket corresponde a un programa que ya terminó.' },
        { status: 401 },
      );
    }

    const esMiembro = inscripcion.id_miembro != null;
    const tablaAsistencia = esMiembro ? 'asistencia_miembro' : 'asistencia_invitado';
    const colPersona = esMiembro ? 'id_miembro' : 'id_invitado';
    const idPersona = esMiembro ? inscripcion.id_miembro : inscripcion.id_invitado;

    const base = {
      tipo: inscripcion.tipo,
      nombre: inscripcion.nombre_completo,
      correo: inscripcion.correo,
      programa: inscripcion.nombre_programa,
      sesion: {
        numero: sesion.numero_sesion,
        titulo: sesion.titulo,
        fecha: sesion.fecha,
      },
      solicitar_talla: Boolean(inscripcion.solicitar_talla),
      talla_playera: inscripcion.talla_playera,
      playera_entregada: inscripcion.playera_entregada,
      hora_entrega_playera: inscripcion.hora_entrega_playera,
      // Tras un escaneo correcto la asistencia de esta sesión queda registrada
      // en ambos caminos; el panel del escáner deja deshacerla desde ahí.
      asistio: true,
    };

    const previa = await client.query(
      `SELECT asistio, registrado_en FROM ${tablaAsistencia}
        WHERE id_sesion = $1 AND ${colPersona} = $2`,
      [idSesion, idPersona],
    );
    if (previa.rows[0]?.asistio) {
      return NextResponse.json({
        success: true,
        alreadyRegistered: true,
        message: 'Asistencia ya registrada en esta sesión',
        data: { ...base, fecha_registro: previa.rows[0].registrado_en },
      });
    }

    // Primera vez en ESTA sesión: mismo upsert que el panel de asistencia.
    const attendanceTime = new Date();
    await client.query(
      `INSERT INTO ${tablaAsistencia} (id_sesion, ${colPersona}, asistio, registrado_en)
       VALUES ($1, $2, true, NOW())
       ON CONFLICT (id_sesion, ${colPersona})
       DO UPDATE SET asistio = true, registrado_en = NOW()`,
      [idSesion, idPersona],
    );

    return NextResponse.json({
      success: true,
      alreadyRegistered: false,
      message: 'Asistencia registrada exitosamente',
      data: { ...base, fecha_registro: attendanceTime },
    });
  } catch (error) {
    console.error('Error en /api/programas/verify-qr:', error);

    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'Error al procesar la verificación' },
      { status: 500 },
    );
  } finally {
    if (client) client.release();
  }
}
