import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import jwt from 'jsonwebtoken';

export async function GET(request) {
  try {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const eventos = await sql`
      SELECT 
        e.id_evento,
        e.nombre_evento as nombre,
        e.fecha,
        e.tipo,
        CASE WHEN am.id_miembro IS NOT NULL THEN true ELSE false END as participacion
      FROM evento e
      LEFT JOIN asistencia_miembro am ON e.id_evento = am.id_evento AND am.id_miembro = ${decoded.id}
      ORDER BY e.fecha DESC
    `;

    // Asegurar que cada evento tenga un ID único
    const eventosConIds = eventos.map(evento => ({
      ...evento,
      id_evento: evento.id_evento || `temp-${Math.random().toString(36).substring(2, 9)}`
    }));

    return NextResponse.json(eventosConIds);
  } catch (error) {
    console.error('Error al obtener eventos:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener los eventos' },
      { status: 500 }
    );
  }
}