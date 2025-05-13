import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET() {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    const eventos = await sql`
      SELECT 
        e.id_evento,
        e.nombre_evento,
        e.descripcion,
        e.tipo,
        e.hermandad,
        e.fecha,
        e.hora_inicio,
        e.hora_fin,
        e.costo,
        e.cupos,
        e.imagen_url,
        COUNT(DISTINCT am.id_miembro) + COUNT(DISTINCT ai.id_invitado) as asistentes_count,
        CASE 
          WHEN e.cupos IS NULL THEN NULL 
          ELSE e.cupos - (COUNT(DISTINCT am.id_miembro) + COUNT(DISTINCT ai.id_invitado))
        END as cupos_disponibles,
        CASE
          WHEN e.fecha < ${today} THEN 'past'
          WHEN e.fecha = ${today} THEN 'today'
          ELSE 'future'
        END as estado
      FROM evento e
      LEFT JOIN asistencia_miembro am ON e.id_evento = am.id_evento
      LEFT JOIN asistencia_invitado ai ON e.id_evento = ai.id_evento
      GROUP BY e.id_evento
      ORDER BY 
        CASE 
          WHEN e.fecha < ${today} THEN 2 
          WHEN e.fecha = ${today} THEN 1 
          ELSE 0 
        END,
        e.fecha ASC,
        e.hora_inicio ASC
    `;
    
    const eventosConFechasFormateadas = eventos.map(evento => ({
      ...evento,
      fecha: new Date(evento.fecha).toISOString().split('T')[0]
    }));
    
    return NextResponse.json(eventosConFechasFormateadas);
  } catch (error) {
    console.error('Error en GET /api/eventos:', error);
    return NextResponse.json(
      { error: 'Error al obtener eventos: ' + error.message },
      { status: 500 }
    );
  }
}