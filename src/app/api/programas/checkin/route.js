// API de check-in fino de PROGRAMAS desde el panel del escáner QR: deshacer o
// rehacer la asistencia de la sesión y marcar la entrega de playera.
//
// El ancla es el MISMO qrToken firmado del ticket (payload { id, pid, ts }),
// igual que /api/eventos/checkin. campo:
//   'asistencia' → upsert en asistencia_miembro/invitado de la sesión indicada
//                  (requiere sesionId del programa del ticket).
//   'playera'    → inscripcion_programa.playera_entregada (una entrega por
//                  participante en TODO el programa; exige solicitar_talla).
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { verificarQrTokenPrograma } from '@/lib/qr-token';
import { ZONA_EVENTOS } from '@/lib/eventos-fechas';

const CAMPOS = new Set(['asistencia', 'playera']);

export async function POST(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;

  try {
    const { qrToken, campo, valor, sesionId } = await request.json();

    if (!qrToken || !CAMPOS.has(campo) || typeof valor !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Solicitud incompleta o inválida' },
        { status: 400 },
      );
    }
    const idSesion = Number(sesionId);
    if (campo === 'asistencia' && (!Number.isInteger(idSesion) || idSesion <= 0)) {
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
    const { id: inscripcionId, pid: programaId } = qrData;

    try {
      client = await connectWithRetry();
    } catch (connectionError) {
      console.error('Error de conexión en /api/programas/checkin:', connectionError);
      return NextResponse.json(
        { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }

    const inscripcionRes = await client.query(
      `SELECT
          ip.id_miembro, ip.id_invitado, ip.estado,
          p.solicitar_talla,
          (((p.fecha_fin + INTERVAL '30 hours') AT TIME ZONE '${ZONA_EVENTOS}') < NOW()) AS ticket_vencido
        FROM inscripcion_programa ip
        JOIN programa_recurrente p ON p.id_programa = ip.id_programa
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

    const ahora = new Date();
    const hora = valor ? ahora : null;

    if (campo === 'playera') {
      if (!inscripcion.solicitar_talla) {
        return NextResponse.json(
          { success: false, error: 'Este programa no entrega playera.' },
          { status: 400 },
        );
      }
      await client.query(
        `UPDATE inscripcion_programa
            SET playera_entregada = $1, hora_entrega_playera = $2, updated_at = NOW()
          WHERE id_inscripcion_programa = $3`,
        [valor, hora, inscripcionId],
      );
    } else {
      // La sesión tiene que ser del programa del ticket.
      const sesion = await client.query(
        'SELECT 1 FROM sesion_programa WHERE id_sesion = $1 AND id_programa = $2',
        [idSesion, programaId],
      );
      if (sesion.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'La sesión no corresponde al programa de este ticket.' },
          { status: 400 },
        );
      }

      const esMiembro = inscripcion.id_miembro != null;
      const tabla = esMiembro ? 'asistencia_miembro' : 'asistencia_invitado';
      const col = esMiembro ? 'id_miembro' : 'id_invitado';
      const idPersona = esMiembro ? inscripcion.id_miembro : inscripcion.id_invitado;
      await client.query(
        `INSERT INTO ${tabla} (id_sesion, ${col}, asistio, registrado_en)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id_sesion, ${col})
         DO UPDATE SET asistio = EXCLUDED.asistio, registrado_en = NOW()`,
        [idSesion, idPersona, valor],
      );
    }

    return NextResponse.json({ success: true, data: { campo, valor, hora } });
  } catch (error) {
    console.error('Error en /api/programas/checkin:', error);

    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { success: false, error: 'No se pudo aplicar el cambio' },
      { status: 500 },
    );
  } finally {
    if (client) client.release();
  }
}
