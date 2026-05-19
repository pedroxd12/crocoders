// API para verificar y marcar asistencia mediante QR
import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireStaff } from '@/lib/auth';

// Ventana máxima de validez del QR: 24 horas. Permite cierto margen sin abrir indefinidamente.
const QR_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Tolerancia frente a relojes desincronizados / sellos generados ligeramente en el "futuro".
const QR_FUTURE_SKEW_MS = 5 * 60 * 1000;

export async function POST(request) {
  const guard = await requireStaff(request);
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
    if (now - tsNum > QR_MAX_AGE_MS) {
      return NextResponse.json({
        success: false,
        error: 'QR expirado, solicite uno nuevo'
      }, { status: 401 });
    }

    try {
      client = await pool.connect();
    } catch (connectionError) {
      console.error('💥 Error de conexión en /api/eventos/verify-qr:', connectionError);
      return NextResponse.json(
        { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }

    await client.query('BEGIN');

    // Verify inscription exists and get details
    const inscripcionRes = await client.query(`
      SELECT
        ie.id_inscripcion,
        ie.id_evento,
        ie.asistio,
        ie.hora_registro_asistencia,
        e.nombre as nombre_evento,
        e.fecha_inicio,
        e.hora_inicio,
        e.hora_fin,
        COALESCE(m.nombre || ' ' || m.apellido_paterno, i.nombre_completo) as nombre_completo,
        COALESCE(m.correo_electronico, i.correo_electronico) as correo
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
        console.error('⚠️ Error en ROLLBACK:', rollbackError);
      }
    }
    console.error('💥 Error en verificación QR:', error);

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
