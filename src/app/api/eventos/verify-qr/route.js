// API para verificar el ticket QR y registrar el acceso.
//
// Individual (miembro/invitado): el primer escaneo marca la asistencia; los
// siguientes responden alreadyRegistered. La respuesta trae talla y estado de
// entrega de playera para que el staff la entregue en el momento.
//
// Equipo: el QR es UNO por equipo (lo recibe el capitán), así que escanearlo NO
// marca a nadie: devuelve el roster (integrantes + asesores, cada uno con su
// asistencia, talla y playera) y el staff marca persona por persona vía
// /api/eventos/checkin.
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { verificarQrToken } from '@/lib/qr-token';
import {
  autorizarStaffEvento,
  cargarInscripcionCheckin,
  cargarRosterEquipo,
} from '@/lib/checkin-eventos';

// Tolerancia frente a relojes desincronizados / sellos generados ligeramente en el "futuro".
const QR_FUTURE_SKEW_MS = 5 * 60 * 1000;

export async function POST(request) {
  // Gate: cualquier usuario autenticado; la autorización fina por evento se hace
  // más abajo (administrador, o pertenencia a staff_evento de ESTE evento).
  const guard = await requireAuth(request);
  if (!guard.ok) return guard.response;

  let client;

  try {
    const { qrToken, eventoId: eventoEsperado } = await request.json();

    if (!qrToken) {
      return NextResponse.json({
        success: false,
        error: 'Token QR requerido'
      }, { status: 400 });
    }

    const secret = process.env.PAYLOAD_SECRET;
    if (!secret) {
      console.error('PAYLOAD_SECRET no configurado');
      return NextResponse.json({
        success: false,
        error: 'Servidor mal configurado'
      }, { status: 500 });
    }

    const qrData = verificarQrToken(qrToken, secret);
    if (!qrData) {
      return NextResponse.json({
        success: false,
        error: 'Token QR inválido o manipulado'
      }, { status: 401 });
    }

    const { id: inscripcionId, eid: eventoId, ts } = qrData;

    // La misma guarda que hace el cliente, ahora también en el servidor: si el
    // escáner se abrió desde la pantalla de UN evento, un ticket de otro evento
    // se rechaza en vez de marcar asistencia donde nadie está mirando.
    if (eventoEsperado != null && Number(eventoEsperado) !== eventoId) {
      return NextResponse.json({
        success: false,
        error: 'Este ticket pertenece a otro evento.'
      }, { status: 400 });
    }

    if (ts > Date.now() + QR_FUTURE_SKEW_MS) {
      return NextResponse.json({
        success: false,
        error: 'QR con fecha futura inválida'
      }, { status: 400 });
    }
    // La caducidad NO se mide en horas desde la emisión, sino contra el fin del
    // evento (`ticket_vencido`, ya cargado con la inscripción). La ventana fija
    // de 24 h dejaba fuera a los invitados: no tienen cuenta, su único ticket es
    // el del correo y no existe ninguna pantalla para pedir otro, así que quien
    // se inscribía con más de un día de antelación llegaba a la puerta con un QR
    // rechazado. Los miembros no lo notaban porque /api/eventos/check-register
    // les regenera el token en cada lectura.

    try {
      client = await connectWithRetry();
    } catch (connectionError) {
      console.error('Error de conexión en /api/eventos/verify-qr:', connectionError);
      return NextResponse.json(
        { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
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
      return NextResponse.json({
        success: false,
        error: 'Inscripción no encontrada'
      }, { status: 404 });
    }

    if (inscripcion.estado === 'cancelada') {
      await client.query('ROLLBACK');
      return NextResponse.json({
        success: false,
        error: 'La inscripción fue cancelada; no se puede registrar asistencia.'
      }, { status: 400 });
    }

    if (inscripcion.ticket_vencido) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        success: false,
        error: 'Este ticket corresponde a un evento que ya terminó.'
      }, { status: 401 });
    }

    // Evento con costo y pago sin verificar: no se deja entrar. El registro deja
    // la inscripción en 'pendiente' hasta que un administrador marca el cobro
    // desde el panel (no hay pasarela de pago en el proyecto).
    if (inscripcion.tiene_costo && !inscripcion.pago_completado) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        success: false,
        error: 'El pago de esta inscripción aún no está verificado. Regístralo en el panel antes de marcar asistencia.',
        code: 'PAGO_PENDIENTE'
      }, { status: 402 });
    }

    const base = {
      tipo: inscripcion.tipo,
      nombre: inscripcion.nombre_completo,
      correo: inscripcion.correo,
      evento: inscripcion.nombre_evento,
      fecha_evento: inscripcion.fecha_inicio,
      solicitar_talla: Boolean(inscripcion.solicitar_talla),
    };

    // Equipo: el escaneo no escribe nada; devuelve el roster para que el staff
    // marque asistencia y entrega de playera persona por persona.
    if (inscripcion.tipo === 'equipo') {
      await client.query('ROLLBACK');
      const roster = await cargarRosterEquipo(client, inscripcion.id_equipo);
      return NextResponse.json({
        success: true,
        alreadyRegistered: false,
        message: 'Equipo verificado',
        data: { ...base, equipo: roster },
      });
    }

    if (inscripcion.asistio) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        success: true,
        alreadyRegistered: true,
        message: 'Asistencia ya registrada previamente',
        data: {
          ...base,
          fecha_registro: inscripcion.hora_registro_asistencia,
          talla_playera: inscripcion.talla_playera,
          playera_entregada: inscripcion.playera_entregada,
          hora_entrega_playera: inscripcion.hora_entrega_playera,
        }
      });
    }

    // Primera vez: se marca la asistencia.
    const attendanceTime = new Date();
    await client.query(`
      UPDATE inscripcion_evento
      SET asistio = true,
          hora_registro_asistencia = $1,
          updated_at = NOW()
      WHERE id_inscripcion = $2
    `, [attendanceTime, inscripcionId]);

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      alreadyRegistered: false,
      message: 'Asistencia registrada exitosamente',
      data: {
        ...base,
        fecha_registro: attendanceTime,
        talla_playera: inscripcion.talla_playera,
        playera_entregada: inscripcion.playera_entregada,
        hora_entrega_playera: inscripcion.hora_entrega_playera,
      }
    });

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error en ROLLBACK:', rollbackError);
      }
    }
    console.error('Error en verificación QR:', error);

    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: false,
      error: 'Error al procesar la verificación'
    }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
