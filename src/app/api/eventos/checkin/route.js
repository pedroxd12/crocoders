// API de check-in fino desde el panel del escáner QR: marcar o desmarcar la
// asistencia y la entrega de playera de una persona concreta.
//
// El ancla de todo es el MISMO qrToken firmado que se escaneó: identifica la
// inscripción sin confiar en ids sueltos del cliente, y la autorización es la
// misma de verify-qr (administrador, o staff del evento con rol que escriba).
//
// objetivo.tipo:
//   'inscripcion' → inscripción individual (miembro/invitado); no lleva id.
//   'integrante'  → integrante_equipo.id_integrante del equipo del ticket.
//   'asesor'      → asesor_equipo.id_asesor del equipo del ticket.
// campo: 'asistencia' | 'playera'. valor: true (marcar) | false (deshacer).
//
// inscripcion_evento.asistio se mantiene como AGREGADO del equipo: true si al
// menos un integrante ya llegó (los asesores no cuentan para el agregado).
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { verificarQrToken } from '@/lib/qr-token';
import { autorizarStaffEvento, cargarInscripcionCheckin } from '@/lib/checkin-eventos';

const CAMPOS = new Set(['asistencia', 'playera']);
const OBJETIVOS = new Set(['inscripcion', 'integrante', 'asesor']);

export async function POST(request) {
  const guard = await requireAuth(request);
  if (!guard.ok) return guard.response;

  let client;

  try {
    const { qrToken, objetivo, campo, valor } = await request.json();

    if (!qrToken || !CAMPOS.has(campo) || typeof valor !== 'boolean' ||
        !objetivo || !OBJETIVOS.has(objetivo.tipo)) {
      return NextResponse.json(
        { success: false, error: 'Solicitud incompleta o inválida' },
        { status: 400 },
      );
    }
    const objetivoId = Number(objetivo.id);
    if (objetivo.tipo !== 'inscripcion' && !Number.isInteger(objetivoId)) {
      return NextResponse.json(
        { success: false, error: 'Falta el id de la persona a marcar' },
        { status: 400 },
      );
    }

    const secret = process.env.PAYLOAD_SECRET;
    if (!secret) {
      console.error('PAYLOAD_SECRET no configurado');
      return NextResponse.json(
        { success: false, error: 'Servidor mal configurado' },
        { status: 500 },
      );
    }

    const qrData = verificarQrToken(qrToken, secret);
    if (!qrData) {
      return NextResponse.json(
        { success: false, error: 'Token QR inválido o manipulado' },
        { status: 401 },
      );
    }
    const { id: inscripcionId, eid: eventoId } = qrData;

    try {
      client = await connectWithRetry();
    } catch (connectionError) {
      console.error('Error de conexión en /api/eventos/checkin:', connectionError);
      return NextResponse.json(
        { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }

    await client.query('BEGIN');

    const auth = await autorizarStaffEvento(client, guard.session, eventoId);
    if (!auth.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const inscripcion = await cargarInscripcionCheckin(client, inscripcionId, eventoId);
    if (!inscripcion) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Inscripción no encontrada' }, { status: 404 });
    }
    if (inscripcion.estado === 'cancelada') {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'La inscripción fue cancelada; no se puede registrar asistencia.' },
        { status: 400 },
      );
    }
    if (inscripcion.ticket_vencido) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Este ticket corresponde a un evento que ya terminó.' },
        { status: 401 },
      );
    }
    // Marcar (no desmarcar) exige el pago verificado, igual que verify-qr.
    if (valor && inscripcion.tiene_costo && !inscripcion.pago_completado) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'El pago de esta inscripción aún no está verificado. Regístralo en el panel antes de marcar.', code: 'PAGO_PENDIENTE' },
        { status: 402 },
      );
    }
    if (campo === 'playera' && !inscripcion.solicitar_talla) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Este evento no entrega playera.' },
        { status: 400 },
      );
    }

    const ahora = new Date();
    const hora = valor ? ahora : null;

    if (objetivo.tipo === 'inscripcion') {
      if (inscripcion.tipo === 'equipo') {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'En un equipo se marca a cada integrante o asesor, no a la inscripción.' },
          { status: 400 },
        );
      }
      if (campo === 'asistencia') {
        await client.query(
          `UPDATE inscripcion_evento
              SET asistio = $1, hora_registro_asistencia = $2, updated_at = NOW()
            WHERE id_inscripcion = $3`,
          [valor, hora, inscripcionId],
        );
      } else {
        await client.query(
          `UPDATE inscripcion_evento
              SET playera_entregada = $1, hora_entrega_playera = $2, updated_at = NOW()
            WHERE id_inscripcion = $3`,
          [valor, hora, inscripcionId],
        );
      }
    } else {
      if (!inscripcion.id_equipo) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'Este ticket no corresponde a un equipo.' },
          { status: 400 },
        );
      }
      const tabla = objetivo.tipo === 'integrante' ? 'integrante_equipo' : 'asesor_equipo';
      const pk = objetivo.tipo === 'integrante' ? 'id_integrante' : 'id_asesor';
      const set = campo === 'asistencia'
        ? 'asistio = $1, hora_asistencia = $2'
        : 'playera_entregada = $1, hora_entrega_playera = $2';
      // El WHERE incluye el equipo del ticket: un id de otro equipo no matchea.
      const upd = await client.query(
        `UPDATE ${tabla} SET ${set} WHERE ${pk} = $3 AND id_equipo = $4`,
        [valor, hora, objetivoId, inscripcion.id_equipo],
      );
      if (upd.rowCount === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'Esa persona no pertenece a este equipo.' },
          { status: 404 },
        );
      }

      // Agregado del equipo: la inscripción figura como "asistió" si al menos
      // un integrante llegó. Se conserva la hora del primero.
      if (objetivo.tipo === 'integrante' && campo === 'asistencia') {
        const { rows: [{ hay }] } = await client.query(
          'SELECT EXISTS(SELECT 1 FROM integrante_equipo WHERE id_equipo = $1 AND asistio) AS hay',
          [inscripcion.id_equipo],
        );
        await client.query(
          `UPDATE inscripcion_evento
              SET asistio = $1,
                  hora_registro_asistencia = CASE WHEN $1 THEN COALESCE(hora_registro_asistencia, $2::timestamp) ELSE NULL END,
                  updated_at = NOW()
            WHERE id_inscripcion = $3`,
          [hay, ahora, inscripcionId],
        );
      }
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      data: { campo, valor, hora },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error en ROLLBACK:', rollbackError);
      }
    }
    console.error('Error en /api/eventos/checkin:', error);

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
