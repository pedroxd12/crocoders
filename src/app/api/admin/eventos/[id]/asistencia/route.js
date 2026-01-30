import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function PUT(request, { params }) {
  try {
    // Solución para Next.js 13+ - Extraer parámetros de forma segura
    const { id } = params;
    await Promise.resolve(); // Asegura que los params estén disponibles
    
    const { id_asistente, es_miembro, asistio } = await request.json();

    if (!id || !id_asistente || typeof asistio !== 'boolean') {
      return NextResponse.json(
        { error: 'Parámetros requeridos faltantes o inválidos' },
        { status: 400 }
      );
    }

    let result;
    if (es_miembro) {
      // Actualizar asistencia de miembro
      result = await sql`
        UPDATE asistencia_miembro 
        SET asistio = ${asistio}
        WHERE id_evento = ${id} AND id_miembro = ${id_asistente}
        RETURNING *
      `;
    } else {
      // Actualizar asistencia de invitado
      result = await sql`
        UPDATE asistencia_invitado 
        SET asistio = ${asistio}
        WHERE id_evento = ${id} AND id_invitado = ${id_asistente}
        RETURNING *
      `;
    }

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Asistencia no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en PUT /api/admin/eventos/[id]/asistencia:', error);
    return NextResponse.json(
      { error: 'Error al actualizar asistencia' },
      { status: 500 }
    );
  }
}