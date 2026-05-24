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

    const eventos = await sql`
      SELECT 
        e.*,
        t.nombre as tipo_nombre,
        t.permite_equipos,
        a.nombre as alcance_nombre,
        c.id_concurso,
        c.modalidad,
        c.max_integrantes_equipo,
        c.min_integrantes_equipo,
        c.requiere_asesor,
        c.url_concurso,
        (
          SELECT COUNT(*)
          FROM inscripcion_evento
          WHERE id_evento = e.id_evento AND estado <> 'cancelada'
        ) as asistentes_count
      FROM evento e
      LEFT JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento a ON e.id_alcance = a.id_alcance
      LEFT JOIN concurso c ON e.id_evento = c.id_evento
      WHERE e.id_evento = ${id} AND e.deleted_at IS NULL AND e.listable = TRUE
    `;
    
    const evento = eventos && eventos.length > 0 ? eventos[0] : null;

    if (!evento) {
      return NextResponse.json(
        { error: 'Evento no encontrado' },
        { status: 404 }
      );
    }

    const eventoFormateado = {
      ...evento,
      // Mapeo para retrocompatibilidad con frontend que espera 'fecha'
      fecha: evento.fecha_inicio instanceof Date ? evento.fecha_inicio.toISOString().split('T')[0] : evento.fecha_inicio,
      fecha_inicio: evento.fecha_inicio instanceof Date ? evento.fecha_inicio.toISOString().split('T')[0] : evento.fecha_inicio,
      fecha_fin: evento.fecha_fin instanceof Date ? evento.fecha_fin.toISOString().split('T')[0] : evento.fecha_fin,
      fecha_limite_registro: evento.fecha_limite_registro instanceof Date ? evento.fecha_limite_registro.toISOString() : evento.fecha_limite_registro,
      hora_inicio: evento.hora_inicio?.toString?.() ?? null,
      hora_fin: evento.hora_fin?.toString?.() ?? null,
      tipo: evento.tipo_nombre || 'Evento',
      tipo_evento: evento.tipo_nombre || 'Evento',
      hermandad: evento.alcance_nombre || 'Club',
      costo: evento.costo !== null ? Number(evento.costo) : null,
      // Mapeo de descripción
      descripcion: evento.descripcion_html,
      // Alias si el frontend lo usa
      nombre_evento: evento.nombre,
      titulo: evento.nombre,
      cupos: evento.cupos !== null ? Number(evento.cupos) : null,
      // Usar columna directa de cupos_disponibles
      cupos_disponibles: evento.cupos_disponibles !== null ? Number(evento.cupos_disponibles) : null,
      asistentes_count: Number(evento.asistentes_count) || 0,
      total_inscritos: Number(evento.asistentes_count) || 0,
      imagen_url: evento.imagen_flyer_url, // Alias si el front usa imagen_url
      url_concurso: evento.url_concurso
    };

    return NextResponse.json(eventoFormateado);
  } catch (error) {
    console.error('Error en GET /api/eventos/[id]:', error);
    return NextResponse.json(
      { error: 'Error al obtener evento' },
      { status: 500 },
    );
  }
}
