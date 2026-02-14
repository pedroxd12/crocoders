// API para verificar y marcar asistencia mediante QR
import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

export async function POST(request) {
  let client;
  
  try {
    const { qrToken } = await request.json();
    
    if (!qrToken) {
      return NextResponse.json({ 
        success: false, 
        error: 'Token QR requerido' 
      }, { status: 400 });
    }

    // Decode and verify QR token
    const crypto = await import('crypto');
    const secret = process.env.Payload_SECRET || 'secret-key-crocoders-secure';
    
    let qrData;
    try {
      const decoded = JSON.parse(Buffer.from(qrToken, 'base64').toString('utf-8'));
      const { data, sig } = decoded;
      
      // Verify signature
      const expectedHash = crypto.createHmac('sha256', secret).update(data).digest('hex');
      if (sig !== expectedHash) {
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

    const { id: inscripcionId, eid: eventoId } = qrData;

    if (!inscripcionId || !eventoId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Datos incompletos en el token' 
      }, { status: 400 });
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
    const now = new Date();
    await client.query(`
      UPDATE inscripcion_evento
      SET asistio = true,
          hora_registro_asistencia = $1,
          updated_at = NOW()
      WHERE id_inscripcion = $2
    `, [now, inscripcionId]);

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
        fecha_registro: now
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
    
    // Manejo específico de errores de conexión
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
