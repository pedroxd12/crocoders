import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

const ROLES_VALIDOS = new Set(['administrador', 'usuario', 'staff']);

export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json({ error: 'ID de miembro inválido' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const rol = body.rol ?? body.tipo;

    if (!ROLES_VALIDOS.has(rol)) {
      return NextResponse.json(
        { error: 'Rol no válido. Use "administrador", "staff" o "usuario"' },
        { status: 400 },
      );
    }

    const [miembro] = await sql`SELECT id_miembro FROM miembro WHERE id_miembro = ${idNum}`;
    if (!miembro) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });
    }

    const [updated] = await sql`
      UPDATE miembro
         SET rol = ${rol}, updated_at = NOW()
       WHERE id_miembro = ${idNum}
      RETURNING id_miembro, nombre, apellido_paterno, apellido_materno, correo_electronico, rol
    `;

    const nombre_completo = `${updated.nombre} ${updated.apellido_paterno} ${updated.apellido_materno || ''}`.trim();

    return NextResponse.json({
      id_miembro: updated.id_miembro,
      nombre_completo,
      correo_electronico: updated.correo_electronico,
      rol: updated.rol,
    });
  } catch (error) {
    console.error('Error en PUT /api/admin/miembros/[id]/rol:', error);
    return NextResponse.json({ error: 'Error al actualizar el rol' }, { status: 500 });
  }
}
