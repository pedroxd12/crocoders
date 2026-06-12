import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const invitados = await sql`
      SELECT * FROM invitado
      ORDER BY nombre_completo
    `;
    return NextResponse.json(invitados);
  } catch (error) {
    console.error('Error en GET /api/admin/invitados:', error);
    return NextResponse.json(
      { error: 'Error al obtener invitados' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const idNum = Number(id);

    if (!Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json(
        { error: 'ID de invitado inválido' },
        { status: 400 }
      );
    }

    // OJO: por las FKs ON DELETE CASCADE, esto elimina también las inscripciones
    // y asistencias del invitado. RETURNING permite distinguir "no existía" (404).
    const deleted = await sql`
      DELETE FROM invitado
      WHERE id_invitado = ${idNum}
      RETURNING id_invitado
    `;

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Invitado no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en DELETE /api/admin/invitados:', error);
    return NextResponse.json(
      { error: 'Error al eliminar invitado' },
      { status: 500 }
    );
  }
}