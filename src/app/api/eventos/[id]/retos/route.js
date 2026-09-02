import { NextResponse } from 'next/server';
import { query } from '@/lib/db-server';
import { listarRetos } from '@/lib/retos';

// Retos (desafíos) públicos de un evento, con las plazas que quedan en cada
// uno. Lo consumen el formulario de inscripción (/eventos/[id]) y la landing
// del evento, así que sólo devuelve los ACTIVOS y sólo de eventos publicados:
// un evento en 'planificacion' no debe filtrar sus desafíos por id.
export async function GET(request, context) {
  const { id } = await context.params;
  if (!id || Number.isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  try {
    const visible = await query(
      `SELECT 1 FROM evento
        WHERE id_evento = $1 AND deleted_at IS NULL AND listable = TRUE
          AND estado IN ('publicado', 'en_curso', 'finalizado')`,
      [id],
    );
    if (visible.rows.length === 0) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    // `query()` de db-server (con reintentos), nunca pool.query() directo.
    const retos = await listarRetos(
      { query: (text, values) => query(text, values) },
      Number(id),
      { soloActivos: true },
    );
    return NextResponse.json(retos);
  } catch (error) {
    console.error('Error en GET /api/eventos/[id]/retos:', error);
    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { error: 'No se pudo conectar con la base de datos.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Error al obtener los desafíos' }, { status: 500 });
  }
}
