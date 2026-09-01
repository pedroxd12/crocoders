// API para verificar y marcar asistencia mediante QR
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { sqlFinEvento } from '@/lib/eventos-fechas';

// Tolerancia frente a relojes desincronizados / sellos generados ligeramente en el "futuro".
const QR_FUTURE_SKEW_MS = 5 * 60 * 1000;

export async function POST(request) {
  // Gate: cualquier usuario autenticado; la autorización fina por evento se hace
  // más abajo (administrador, o pertenencia a staff_evento de ESTE evento).
  const guard = await requireAuth(request);
  if (!guard.ok) return guard.response;

  let client;

  try {
    const { qrToken } = await request.json();

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

    const crypto = await import('crypto');

    let qrData;
    try {
      const decoded = JSON.parse(Buffer.from(qrToken, 'base64').toString('utf-8'));
      const { data, sig } = decoded;

      if (!data || typeof sig !== 'string') throw new Error('Estructura inválida');

      // Verify signature con comparación de tiempo constante
      const expectedHash = crypto.createHmac('sha256', secret).update(data).digest('hex');
      const sigBuf = Buffer.from(sig, 'hex');
      const expectedBuf = Buffer.from(expectedHash, 'hex');
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return NextResponse.json({
          success: false,
          error: 'Token inválido o manipulado'
        }, { status: 401 });
      }

      qrData = JSON.parse(data);
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: 'Token QR inválido'
      }, { status: 400 });
    }

    const { id: inscripcionId, eid: eventoId, ts } = qrData;

    if (!inscripcionId || !eventoId) {
      return NextResponse.json({
        success: false,
        error: 'Datos incompletos en el token'
      }, { status: 400 });
    }

    // Validar timestamp del QR (frescura/replay window)
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) {
      return NextResponse.json({
        success: false,
        error: 'Marca de tiempo inválida en QR'
      }, { status: 400 });
    }
    const now = Date.now();
    if (tsNum > now + QR_FUTURE_SKEW_MS) {
      return NextResponse.json({
        success: false,
        error: 'QR con fecha futura inválida'
      }, { status: 400 });
    }
    // La caducidad NO se mide en horas desde la emisión, sino contra el fin del
    // evento (se comprueba más abajo, con los datos ya cargados). La ventana fija
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

    // Autorización por evento: un administrador puede marcar cualquier evento;
    // el staff solo los eventos donde está asignado.
    const role = (guard.session.role || '').toLowerCase();
    if (role !== 'administrador') {
      // No basta con estar en staff_evento: el rol tiene que poder ESCRIBIR.
      // `catalogo_rol_staff` define puede_administrar/puede_editar/puede_ver y
      // hasta ahora nadie los leía, así que un rol de sólo consulta marcaba
      // asistencia igual que el coordinador.
      const staffRes = await client.query(
        `SELECT r.puede_administrar, r.puede_editar
           FROM staff_evento se
           LEFT JOIN catalogo_rol_staff r ON se.id_rol = r.id_rol
          WHERE se.id_evento = $1 AND se.id_miembro = $2`,
        [eventoId, Number(guard.session.id)],
      );
      if (staffRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'No tienes permiso para registrar asistencia en este evento.' },
          { status: 403 },
        );
      }
      // Si la asignación no tiene rol (id_rol NULL) se conserva el comportamiento
      // anterior y se permite: negarlo dejaría fuera al staff ya asignado sin rol.
      const puedeEscribir = staffRes.rows.some(
        (r) => r.puede_administrar === null || r.puede_administrar || r.puede_editar,
      );
      if (!puedeEscribir) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'Tu rol en este evento es de solo consulta; no puedes registrar asistencia.' },
          { status: 403 },
        );
      }
    }

    // Verify inscription exists and get details
    const inscripcionRes = await client.query(`
      SELECT
        ie.id_inscripcion,
        ie.id_evento,
        ie.asistio,
        ie.hora_registro_asistencia,
        ie.pago_completado,
        e.tiene_costo,
        e.nombre as nombre_evento,
        e.fecha_inicio,
        e.hora_inicio,
        e.hora_fin,
        -- El ticket vale hasta 6 h después del fin del evento (margen para el
        -- cierre). Comparado en SQL con la zona fija del club, no en JS.
        ((${sqlFinEvento('e')} + INTERVAL '6 hours') < NOW()) AS ticket_vencido,
        COALESCE(m.nombre || ' ' || m.apellido_paterno, i.nombre_completo) as nombre_completo,
        COALESCE(m.correo_electronico, i.correo_electronico) as correo,
        ie.estado
      FROM inscripcion_evento ie
      JOIN evento e ON ie.id_evento = e.id_evento
      LEFT JOIN miembro m ON ie.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ie.id_invitado = i.id_invitado
      WHERE ie.id_inscripcion = $1 AND ie.id_evento = $2
    `, [inscripcionId, eventoId]);

    if (inscripcionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        success: false,
        error: 'Inscripción no encontrada'
      }, { status: 404 });
    }

    const inscripcion = inscripcionRes.rows[0];

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

    // Check if already attended
    if (inscripcion.asistio) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        success: true,
        alreadyRegistered: true,
        message: 'Asistencia ya registrada previamente',
        data: {
          nombre: inscripcion.nombre_completo,
          evento: inscripcion.nombre_evento,
          fecha_registro: inscripcion.hora_registro_asistencia
        }
      });
    }

    // Mark attendance
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
        nombre: inscripcion.nombre_completo,
        correo: inscripcion.correo,
        evento: inscripcion.nombre_evento,
        fecha_evento: inscripcion.fecha_inicio,
        fecha_registro: attendanceTime
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
