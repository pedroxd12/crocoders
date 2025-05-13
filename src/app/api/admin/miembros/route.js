import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET() {
  try {
    const miembros = await sql`
      SELECT 
        m.id_miembro,
        m.nombre_completo,
        m.correo_electronico,
        m.tipo,
        m.numero_telefono,
        cf.usuario as usuario_codeforces,
        vj.usuario as usuario_vjudge,
        ou.usuario as usuario_omegaup
      FROM miembro m
      LEFT JOIN codeforces cf ON m.id_miembro = cf.id_miembro
      LEFT JOIN vjudge vj ON m.id_miembro = vj.id_miembro
      LEFT JOIN omegaup ou ON m.id_miembro = ou.id_miembro
      ORDER BY m.nombre_completo
    `;
    return NextResponse.json(miembros);
  } catch (error) {
    console.error('Error en GET /api/admin/miembros:', error);
    return NextResponse.json(
      { error: 'Error al obtener la lista de miembros' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { correo_electronico } = await request.json();
    
    if (!correo_electronico) {
      return NextResponse.json(
        { error: 'El correo electrónico es requerido' },
        { status: 400 }
      );
    }

    // Verificar si el miembro existe
    const [miembro] = await sql`
      SELECT id_miembro, tipo FROM miembro 
      WHERE correo_electronico = ${correo_electronico}
    `;

    if (!miembro) {
      return NextResponse.json(
        { error: 'No se encontró un miembro con ese correo electrónico' },
        { status: 404 }
      );
    }

    // Si ya es administrador, no hacer nada
    if (miembro.tipo === 'administrador') {
      return NextResponse.json(
        { message: 'Este miembro ya es administrador' },
        { status: 200 }
      );
    }

    // Actualizar a administrador
    const [updatedMiembro] = await sql`
      UPDATE miembro 
      SET tipo = 'administrador'
      WHERE id_miembro = ${miembro.id_miembro}
      RETURNING id_miembro, nombre_completo, correo_electronico, tipo
    `;

    return NextResponse.json(updatedMiembro);
  } catch (error) {
    console.error('Error en POST /api/admin/miembros:', error);
    return NextResponse.json(
      { error: 'Error al asignar rol de administrador: ' + error.message },
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
        { error: 'ID de miembro no proporcionado' },
        { status: 400 }
      );
    }

    // Verificar si el miembro existe y es administrador
    const [miembro] = await sql`
      SELECT id_miembro, tipo FROM miembro WHERE id_miembro = ${id}
    `;

    if (!miembro) {
      return NextResponse.json(
        { error: 'Miembro no encontrado' },
        { status: 404 }
      );
    }

    // Verificar si es el último administrador
    if (miembro.tipo === 'administrador') {
      const [adminCount] = await sql`
        SELECT COUNT(*) as count FROM miembro WHERE tipo = 'administrador'
      `;
      
      if (adminCount.count <= 1) {
        return NextResponse.json(
          { error: 'No se puede eliminar el último administrador' },
          { status: 400 }
        );
      }
    }

    // Eliminar registros relacionados primero
    await sql`DELETE FROM codeforces WHERE id_miembro = ${id}`;
    await sql`DELETE FROM vjudge WHERE id_miembro = ${id}`;
    await sql`DELETE FROM omegaup WHERE id_miembro = ${id}`;
    await sql`DELETE FROM asistencia_miembro WHERE id_miembro = ${id}`;

    // Finalmente eliminar el miembro
    await sql`DELETE FROM miembro WHERE id_miembro = ${id}`;

    return NextResponse.json({ 
      success: true,
      message: 'Miembro eliminado correctamente'
    });
  } catch (error) {
    console.error('Error en DELETE /api/admin/miembros:', error);
    return NextResponse.json(
      { error: 'Error al eliminar miembro: ' + error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const { tipo } = await request.json();

    // Verificar si es el último administrador
    if (tipo !== 'administrador') {
      const [adminCount] = await sql`
        SELECT COUNT(*) as count FROM miembro WHERE tipo = 'administrador'
      `;
      
      const [currentUser] = await sql`
        SELECT tipo FROM miembro WHERE id_miembro = ${id}
      `;
      
      if (currentUser.tipo === 'administrador' && adminCount.count <= 1) {
        return NextResponse.json(
          { error: 'No se puede quitar el último administrador' },
          { status: 400 }
        );
      }
    }

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
      { error: 'Error al actualizar rol: ' + error.message },
      { status: 500 }
    );
  }
}