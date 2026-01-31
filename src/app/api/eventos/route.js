import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

export async function GET() {
  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Usamos JOINs para recuperar los nombres de catálogos y aliamos para mantener compatibilidad
    // con el frontend tanto como sea posible
    const query = `
      SELECT 
        e.id_evento,
        e.nombre as nombre_evento,
        e.descripcion_html as descripcion,
        t.nombre as tipo,
        a.nombre as hermandad, -- Compatibilidad con frontend anterior que usaba 'hermandad'
        e.fecha_inicio as fecha,
        e.hora_inicio,
        e.fecha_fin,
        e.hora_fin,
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
      ORDER BY 
        e.fecha_inicio ASC,
        e.hora_inicio ASC
    `;
    
    const result = await client.query(query);
    
    const eventos = result.rows.map(evento => {
        // Determinar estado de tiempo para UI (past/today/future)
        let estadoTiempo = 'future';
        if (evento.fecha < today) estadoTiempo = 'past';
        else if (evento.fecha === today) estadoTiempo = 'today';

        return {
            ...evento,
            estado: estadoTiempo, // Sobrescribir estado DB con estado visual
            fecha: new Date(evento.fecha).toISOString().split('T')[0]
        };
    });
    
    return NextResponse.json(eventos);
  } catch (error) {
    console.error('Error en GET /api/eventos:', error);
    return NextResponse.json(
      { error: 'Error al obtener eventos: ' + error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
