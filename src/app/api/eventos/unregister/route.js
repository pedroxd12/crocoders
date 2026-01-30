// app/api/eventos/unregister/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function POST(request) {
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

    // Verificar si el usuario existe según el tipo
    let userExists;
    if (tipo === 'miembro') {
      const [user] = await sql`
        SELECT id_miembro FROM miembro WHERE id_miembro = ${userId} LIMIT 1
      `;
      userExists = user?.id_miembro;
    } else {
      const [user] = await sql`
        SELECT id_invitado FROM invitado WHERE id_invitado = ${userId} LIMIT 1
      `;
      userExists = user?.id_invitado;
    }
    
    if (!userExists) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }
    
    // Verificar si el evento existe
    const [evento] = await sql`
      SELECT id_evento FROM evento WHERE id_evento = ${eventoId} LIMIT 1
    `;
    
    if (!evento) {
      return NextResponse.json(
        { success: false, error: 'Evento no encontrado' },
        { status: 404 }
      );
    }
    
    // Verificar si el usuario está registrado en el evento
    let registroExistente;
    if (tipo === 'miembro') {
      [registroExistente] = await sql`
        SELECT 1 FROM asistencia_miembro 
        WHERE id_evento = ${eventoId} AND id_miembro = ${userId} 
        LIMIT 1
      `;
    } else {
      [registroExistente] = await sql`
        SELECT 1 FROM asistencia_invitado 
        WHERE id_evento = ${eventoId} AND id_invitado = ${userId} 
        LIMIT 1
      `;
    }
    
    if (!registroExistente) {
      return NextResponse.json(
        { success: false, error: 'El usuario no está registrado en este evento' },
        { status: 400 }
      );
    }
    
    // Eliminar el registro según el tipo
    if (tipo === 'miembro') {
      await sql`
        DELETE FROM asistencia_miembro 
        WHERE id_evento = ${eventoId} AND id_miembro = ${userId}
      `;
    } else {
      await sql`
        DELETE FROM asistencia_invitado 
        WHERE id_evento = ${eventoId} AND id_invitado = ${userId}
      `;
    }
    
    // Obtener datos actualizados del evento
    const [updatedEvent] = await sql`
      SELECT 
        e.id_evento,
        e.nombre_evento,
        e.fecha,
        e.hora_inicio,
        COUNT(DISTINCT am.id_miembro) + COUNT(DISTINCT ai.id_invitado) as asistentes_count,
        CASE 
          WHEN e.cupos IS NULL THEN NULL 
          ELSE e.cupos - (COUNT(DISTINCT am.id_miembro) + COUNT(DISTINCT ai.id_invitado))
        END as cupos_disponibles
      FROM evento e
      LEFT JOIN asistencia_miembro am ON e.id_evento = am.id_evento
      LEFT JOIN asistencia_invitado ai ON e.id_evento = ai.id_evento
      WHERE e.id_evento = ${eventoId}
      GROUP BY e.id_evento
    `;
    
    return NextResponse.json({ 
      success: true,
      message: 'Cancelación de registro exitosa',
      event: {
        ...updatedEvent,
        fecha: updatedEvent.fecha.toISOString().split('T')[0],
        asistentes_count: Number(updatedEvent.asistentes_count) || 0,
        cupos_disponibles: updatedEvent.cupos_disponibles !== null ? Number(updatedEvent.cupos_disponibles) : null
      }
    });
  } catch (error) {
    console.error('Error en POST /api/eventos/unregister:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}