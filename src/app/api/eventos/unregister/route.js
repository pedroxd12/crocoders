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
        SELECT 1 FROM inscripcion_evento 
        WHERE id_evento = ${eventoId} AND id_miembro = ${userId} 
        LIMIT 1
      `;
    } else {
      [registroExistente] = await sql`
        SELECT 1 FROM inscripcion_evento 
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
    
    // Eliminar el registro (o marcar como cancelado si prefieres historial, pero el usuario pidió borrar)
    // Usaremos DELETE físico como pidió el usuario para miembros, aqui aplica igual para la inscripción
    if (tipo === 'miembro') {
      await sql`
        DELETE FROM inscripcion_evento 
        WHERE id_evento = ${eventoId} AND id_miembro = ${userId}
      `;
    } else {
      await sql`
        DELETE FROM inscripcion_evento 
        WHERE id_evento = ${eventoId} AND id_invitado = ${userId}
      `;
    }
    
    // Obtener datos actualizados del evento (cupos se actualizan via trigger)
    const [updatedEvent] = await sql`
      SELECT 
        id_evento,
        nombre as nombre_evento,
        fecha_inicio as fecha,
        hora_inicio,
        cupos_disponibles,
        (SELECT COUNT(*) FROM inscripcion_evento WHERE id_evento = ${eventoId}) as asistentes_count
      FROM evento
      WHERE id_evento = ${eventoId}
    `;
    
    if (!updatedEvent) return NextResponse.json({ success: true, message: 'Registro cancelado' });

    return NextResponse.json({ 
      success: true,
      message: 'Cancelación de registro exitosa',
      event: {
        ...updatedEvent,
        fecha: updatedEvent.fecha instanceof Date ? updatedEvent.fecha.toISOString().split('T')[0] : updatedEvent.fecha,
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