import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function PUT(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    // Extraer el ID de la URL
    const id = request.url.split('/').slice(-2, -1)[0];
    
    // Obtener el cuerpo de la petición
    const { tipo } = await request.json();

    // Validar el tipo de rol
    if (!['administrador', 'usuario'].includes(tipo)) {
      return NextResponse.json(
        { error: 'Tipo de rol no válido. Use "administrador" o "usuario"' },
        { status: 400 }
      );
    }

    // Verificar que el miembro existe
    const [miembro] = await sql`
      SELECT id_miembro FROM miembro WHERE id_miembro = ${id}
    `;

    if (!miembro) {
      return NextResponse.json(
        { error: 'Miembro no encontrado' },
        { status: 404 }
      );
    }

    // Actualizar el rol y devolver el miembro actualizado
    const [updatedMiembro] = await sql`
      UPDATE miembro 
      SET tipo = ${tipo}
      WHERE id_miembro = ${id}
      RETURNING id_miembro, nombre_completo, correo_electronico, tipo
    `;

    return NextResponse.json(updatedMiembro);
  } catch (error) {
    console.error('Error en PUT /api/admin/miembros/[id]/rol:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el rol: ' + error.message },
      { status: 500 }
    );
  }
}