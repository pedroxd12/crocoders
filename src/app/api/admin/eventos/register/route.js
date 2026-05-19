
import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function POST(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { id_evento, id_usuario, tipo_usuario } = body;

  if (!id_evento || !id_usuario || !tipo_usuario) {
    return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if event exists and has space
    const eventRes = await client.query(
      'SELECT cupos_disponibles, cupos FROM evento WHERE id_evento = $1',
      [id_evento]
    );

    if (eventRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    const { cupos_disponibles } = eventRes.rows[0];

    // Note: Admins can override capacity? Let's assume No for now, or warn. 
    // Usually admins want to force register even if full. 
    // Let's allow it but maybe warn? For now, strict check.
    if (cupos_disponibles <= 0) {
       await client.query('ROLLBACK');
       return NextResponse.json({ error: 'El evento ya no tiene cupos disponibles' }, { status: 400 });
    }

    // 2. Check if already registered
    const existingRes = await client.query(
      `SELECT id_inscripcion FROM inscripcion_evento 
       WHERE id_evento = $1 
       AND ((id_miembro = $2 AND $3 = 'miembro') OR (id_invitado = $2 AND $3 = 'invitado'))`,
      [id_evento, id_usuario, tipo_usuario]
    );

    if (existingRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'El usuario ya está registrado en este evento' }, { status: 400 });
    }

    // 3. Insert Inscription
    let insertQuery = '';
    let values = [];

    if (tipo_usuario === 'miembro') {
      insertQuery = `
        INSERT INTO inscripcion_evento (id_evento, id_miembro, fecha_inscripcion, estado)
        VALUES ($1, $2, NOW(), 'confirmada')
        RETURNING id_inscripcion
      `;
      values = [id_evento, id_usuario];
    } else {
      insertQuery = `
        INSERT INTO inscripcion_evento (id_evento, id_invitado, fecha_inscripcion, estado)
        VALUES ($1, $2, NOW(), 'confirmada')
        RETURNING id_inscripcion
      `;
      values = [id_evento, id_usuario];
    }

    const insertRes = await client.query(insertQuery, values);
    
    // Trigger should handle cupos update, but we rely on DB triggers usually.
    // Assuming DB triggers exist as per previous context.

    await client.query('COMMIT');

    return NextResponse.json({ 
        message: 'Usuario registrado exitosamente',
        id_inscripcion: insertRes.rows[0].id_inscripcion 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin register error:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'El usuario ya está registrado en este evento', code: 'ALREADY_REGISTERED' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Error al registrar usuario' }, { status: 500 });
  } finally {
    client.release();
  }
}
