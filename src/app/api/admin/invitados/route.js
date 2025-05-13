import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET() {
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
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID de invitado no proporcionado' },
        { status: 400 }
      );
    }

    await sql`
      DELETE FROM invitado
      WHERE id_invitado = ${id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en DELETE /api/admin/invitados:', error);
    return NextResponse.json(
      { error: 'Error al eliminar invitado' },
      { status: 500 }
    );
  }
}