import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

export async function POST(request) {
  const client = await pool.connect();
  try {
    const data = await request.json();
    const { eventoId, userId, tipo } = data;
    
    // Validaciones básicas
    if (!eventoId || isNaN(Number(eventoId))) {
      return NextResponse.json(
        { success: false, error: 'ID de evento no válido' },
        { status: 400 }
      );
    }
    
    if (!userId || isNaN(Number(userId))) {
      return NextResponse.json(
        { success: false, error: 'ID de usuario no válido' },
        { status: 400 }
      );
    }
    
    if (!tipo || !['miembro', 'invitado'].includes(tipo)) {
      return NextResponse.json(
        { success: false, error: 'Tipo de registro no válido' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // Verificar si el evento existe y tiene cupos
    const eventoRes = await client.query(
      'SELECT id_evento, cupos_disponibles, estado FROM evento WHERE id_evento = $1 FOR UPDATE',
      [eventoId]
    );
    
    if (eventoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'Evento no encontrado' },
        { status: 404 }
      );
    }
    
    const evento = eventoRes.rows[0];

    // Verificar estado
    if (!['publicado', 'en_curso'].includes(evento.estado)) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'El evento no está disponible para registros.' },
          { status: 400 }
        );
    }
    
    // Verificar cupos
    if (evento.cupos_disponibles <= 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'No hay cupos disponibles para este evento' },
        { status: 400 }
      );
    }
    
    // Verificar si ya está registrado
    let checkQuery = '';
    let checkParams = [eventoId, userId];
    
    if (tipo === 'miembro') {
        checkQuery = 'SELECT 1 FROM inscripcion_evento WHERE id_evento = $1 AND id_miembro = $2';
    } else {
        checkQuery = 'SELECT 1 FROM inscripcion_evento WHERE id_evento = $1 AND id_invitado = $2';
    }
    
    const checkRes = await client.query(checkQuery, checkParams);
    
    if (checkRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'El usuario ya está registrado en este evento' },
        { status: 400 }
      );
    }
    
    // Registrar
    // Nota: El trigger actualizará cupos_disponibles si estado = 'confirmada'
    // Establecemos estado 'confirmada' por defecto si no requiere pago, o 'pendiente' si requiere.
    // Para simplificar y mantener compatibilidad con codigo viejo (que no manejaba pagos), pondremos 'confirmada'.
    
    let insertQuery = '';
    if (tipo === 'miembro') {
        insertQuery = `
            INSERT INTO inscripcion_evento (id_evento, id_miembro, estado, fecha_inscripcion)
            VALUES ($1, $2, 'confirmada', NOW())
        `;
    } else {
        insertQuery = `
            INSERT INTO inscripcion_evento (id_evento, id_invitado, estado, fecha_inscripcion)
            VALUES ($1, $2, 'confirmada', NOW())
        `;
    }
    
    await client.query(insertQuery, [eventoId, userId]);

    await client.query('COMMIT');
    
    return NextResponse.json({
      success: true,
      message: 'Registro exitoso'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en registro:', error);
    return NextResponse.json(
      { success: false, error: 'Error al registrarse en el evento: ' + error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
