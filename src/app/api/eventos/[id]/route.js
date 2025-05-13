import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET(request, context) {
  try {
    const { id } = await context.params; // ✅ acceso asincrónico

    if (!id || isNaN(Number(id))) {
      return NextResponse.json(
        { error: 'ID de evento es requerido y debe ser un número válido' },
        { status: 400 }
      );
    }

    const [evento] = await sql`
      SELECT 
        e.*,
        COUNT(DISTINCT am.id_miembro) + COUNT(DISTINCT ai.id_invitado) as asistentes_count,
        CASE 
          WHEN e.cupos IS NULL THEN NULL 
          ELSE e.cupos - (COUNT(DISTINCT am.id_miembro) + COUNT(DISTINCT ai.id_invitado))
        END as cupos_disponibles
      FROM evento e
      LEFT JOIN asistencia_miembro am ON e.id_evento = am.id_evento
      LEFT JOIN asistencia_invitado ai ON e.id_evento = ai.id_evento
      WHERE e.id_evento = ${id}
      GROUP BY e.id_evento
    `;

    if (!evento) {
      return NextResponse.json(
        { error: 'Evento no encontrado' },
        { status: 404 }
      );
    }

    const eventoFormateado = {
      ...evento,
      fecha: evento.fecha instanceof Date ? evento.fecha.toISOString().split('T')[0] : evento.fecha,
      hora_inicio: evento.hora_inicio?.toString?.() ?? null,
      hora_fin: evento.hora_fin?.toString?.() ?? null,
      tipo: evento.tipo || 'club',
      costo: evento.costo !== null ? Number(evento.costo) : null,
      cupos: evento.cupos !== null ? Number(evento.cupos) : null,
      cupos_disponibles: evento.cupos_disponibles !== null ? Number(evento.cupos_disponibles) : null,
      asistentes_count: Number(evento.asistentes_count) || 0
    };

    return NextResponse.json(eventoFormateado);
  } catch (error) {
    console.error('Error en GET /api/eventos/[id]:', error);
    return NextResponse.json(
      { error: 'Error al obtener evento: ' + error.message },
      { status: 500 }
    );
  }
}
