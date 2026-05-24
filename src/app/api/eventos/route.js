import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Usamos template literals con sql helper para mejor manejo de errores
    const eventos = await sql`
      SELECT 
        e.id_evento,
        e.nombre as nombre_evento,
        e.descripcion_html as descripcion,
        t.nombre as tipo,
        a.nombre as hermandad,
        e.fecha_inicio as fecha,
        e.hora_inicio,
        e.fecha_fin,
        e.hora_fin,
        e.fecha_limite_registro,
        e.costo,
        e.cupos,
        e.ubicacion,
        e.cupos_disponibles,
        e.imagen_flyer_url as imagen_url,
        e.estado
      FROM evento e
      JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
      JOIN catalogo_alcance_evento a ON e.id_alcance = a.id_alcance
      WHERE e.estado IN ('publicado', 'en_curso')
        AND e.deleted_at IS NULL
        AND e.listable = TRUE
      ORDER BY
        e.fecha_inicio ASC,
        e.hora_inicio ASC
    `;
    
    const eventosFormateados = eventos.map(evento => {
        // Determinar estado de tiempo para UI (past/today/future)
        let estadoTiempo = 'future';
        if (evento.fecha < today) estadoTiempo = 'past';
        else if (evento.fecha === today) estadoTiempo = 'today';

        return {
            ...evento,
            estado: estadoTiempo, // Sobrescribir estado DB con estado visual
            fecha: new Date(evento.fecha).toISOString().split('T')[0],
            fecha_fin: evento.fecha_fin ? new Date(evento.fecha_fin).toISOString().split('T')[0] : evento.fecha,
            hora_inicio: evento.hora_inicio?.toString?.() ?? null,
            hora_fin: evento.hora_fin?.toString?.() ?? null,
            costo: evento.costo !== null ? Number(evento.costo) : null,
            cupos: evento.cupos !== null ? Number(evento.cupos) : null,
            cupos_disponibles: evento.cupos_disponibles !== null ? Number(evento.cupos_disponibles) : null
        };
    });
    
    return NextResponse.json(eventosFormateados);
  } catch (error) {
    console.error('💥 Error en GET /api/eventos:', error);
    
    // Manejo específico de errores de conexión
    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { error: 'Error de conexión con la base de datos. Por favor, intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Error al obtener eventos: ' + error.message },
      { status: 500 }
    );
  }
}
