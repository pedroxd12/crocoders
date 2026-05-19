import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const { id, asistenteId } = params;
    const url = new URL(request.url);
    const esMiembro = url.searchParams.get('tipo') === 'miembro';
    
    if (!id || !asistenteId) {
      return NextResponse.json(
        { error: 'Parámetros requeridos faltantes' },
        { status: 400 }
      );
    }

    let asistente;
    if (esMiembro) {
      // Verificar asistencia de miembro
      [asistente] = await sql`
        SELECT m.*, am.asistio
        FROM asistencia_miembro am
        JOIN miembro m ON am.id_miembro = m.id_miembro
        WHERE am.id_evento = ${id} AND am.id_miembro = ${asistenteId}
      `;
    } else {
      // Verificar asistencia de invitado
      [asistente] = await sql`
        SELECT i.*, ai.asistio
        FROM asistencia_invitado ai
        JOIN invitado i ON ai.id_invitado = i.id_invitado
        WHERE ai.id_evento = ${id} AND ai.id_invitado = ${asistenteId}
      `;
    }

    return NextResponse.json({
      registrado: !!asistente,
      asistente: asistente || null
    });
  } catch (error) {
    console.error('Error en GET /api/admin/eventos/[id]/asistencia/[asistenteId]:', error);
    return NextResponse.json(
      { error: 'Error al verificar asistencia' },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const { id, asistenteId } = params;
    const { es_miembro, asistio } = await request.json();
    
    if (!id || !asistenteId || typeof asistio !== 'boolean') {
      return NextResponse.json(
        { error: 'Parámetros requeridos faltantes o inválidos' },
        { status: 400 }
      );
    }

    let result;
    if (es_miembro) {
      result = await sql`
        UPDATE asistencia_miembro
        SET asistio = ${asistio}
        WHERE id_evento = ${id} AND id_miembro = ${asistenteId}
        RETURNING *
      `;
    } else {
      result = await sql`
        UPDATE asistencia_invitado
        SET asistio = ${asistio}
        WHERE id_evento = ${id} AND id_invitado = ${asistenteId}
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
    console.error('Error en PUT /api/admin/eventos/[id]/asistencia/[asistenteId]:', error);
    return NextResponse.json(
      { error: 'Error al actualizar asistencia' },
      { status: 500 }
    );
  }
}