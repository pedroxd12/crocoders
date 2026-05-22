import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET(request, context) {
  try {
    const { id } = await context.params; // ✅ Alternativa recomendada

    if (!id || isNaN(Number(id))) {
      return NextResponse.json(
        { error: 'ID de evento es requerido y debe ser un número válido' },
        { status: 400 }
      );
    }

    const imagenes = await sql`
      SELECT
        id_evidencia AS id_imagen,
        id_evento,
        titulo AS nombre_archivo,
        url AS ruta,
        fecha_captura AS fecha_subida
      FROM evidencia
      WHERE id_evento = ${id} AND publica = true
      ORDER BY orden ASC, fecha_captura DESC
    `;

    const imagenesFormateadas = imagenes.map((img) => ({
      ...img,
      fecha_subida: img.fecha_subida instanceof Date
        ? img.fecha_subida.toISOString()
        : img.fecha_subida
    }));

    return NextResponse.json(imagenesFormateadas);
  } catch (error) {
    console.error('Error en GET /api/eventos/[id]/imagenes:', error);
    return NextResponse.json(
      { error: 'Error al obtener imágenes del evento' },
      { status: 500 },
    );
  }
}
