import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET(request, { params }) {
  try {
    // Esperar a que los parámetros estén disponibles
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID de evento es requerido' },
        { status: 400 }
      );
    }

    // Obtener información básica del evento
    const [evento] = await sql`
      SELECT nombre_evento, fecha, hora_inicio, hora_fin 
      FROM evento 
      WHERE id_evento = ${id}
    `;

    if (!evento) {
      return NextResponse.json(
        { error: 'Evento no encontrado' },
        { status: 404 }
      );
    }

// Obtener miembros asistentes con información de asistencia
const miembros = await sql`
  SELECT 
    m.id_miembro,
    m.nombre_completo,
    m.correo_electronico,
    m.numero_telefono,
    m.tipo as rol_miembro,
    m.semestre,
    m.carrera,
    am.asistio
  FROM asistencia_miembro am
  JOIN miembro m ON am.id_miembro = m.id_miembro
  WHERE am.id_evento = ${id}
  ORDER BY m.nombre_completo
`;

// Obtener invitados asistentes con información de asistencia
const invitados = await sql`
  SELECT 
    i.id_invitado,
    i.nombre_completo,
    i.correo_electronico,
    i.numero_telefono,
    i.semestre,
    i.carrera,
    ai.asistio
  FROM asistencia_invitado ai
  JOIN invitado i ON ai.id_invitado = i.id_invitado
  WHERE ai.id_evento = ${id}
  ORDER BY i.nombre_completo
`;

    return NextResponse.json({
      evento,
      miembros: miembros || [],
      invitados: invitados || [],
      total_asistentes: (miembros?.length || 0) + (invitados?.length || 0)
    });
  } catch (error) {
    console.error('Error en GET /api/admin/eventos/[id]/asistentes:', error);
    return NextResponse.json(
      { error: 'Error al obtener asistentes' },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    // Esperar a que los parámetros estén disponibles
    const { id } = await params;
    
    const { id_asistente, es_miembro } = await request.json();

    if (!id || !id_asistente) {
      return NextResponse.json(
        { error: 'Parámetros requeridos faltantes' },
        { status: 400 }
      );
    }

    let result;
    if (es_miembro) {
      // Registrar asistencia de miembro
      result = await sql`
        INSERT INTO asistencia_miembro (id_evento, id_miembro, asistio)
        VALUES (${id}, ${id_asistente}, false)
        ON CONFLICT (id_evento, id_miembro) DO NOTHING
        RETURNING *
      `;
    } else {
      // Registrar asistencia de invitado
      result = await sql`
        INSERT INTO asistencia_invitado (id_evento, id_invitado, asistio)
        VALUES (${id}, ${id_asistente}, false)
        ON CONFLICT (id_evento, id_invitado) DO NOTHING
        RETURNING *
      `;
    }

    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: 'El asistente ya estaba registrado' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Error en POST /api/admin/eventos/[id]/asistentes:', error);
    return NextResponse.json(
      { error: 'Error al registrar asistente' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    // Esperar a que los parámetros estén disponibles
    const { id } = await params;
    
    const { id_asistente, es_miembro } = await request.json();

    if (!id || !id_asistente) {
      return NextResponse.json(
        { error: 'Parámetros requeridos faltantes' },
        { status: 400 }
      );
    }

    let result;
    if (es_miembro) {
      // Eliminar asistencia de miembro
      result = await sql`
        DELETE FROM asistencia_miembro 
        WHERE id_evento = ${id} AND id_miembro = ${id_asistente}
        RETURNING *
      `;
    } else {
      // Eliminar asistencia de invitado
      result = await sql`
        DELETE FROM asistencia_invitado 
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
    console.error('Error en DELETE /api/admin/eventos/[id]/asistentes:', error);
    return NextResponse.json(
      { error: 'Error al eliminar asistente' },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    // Esperar a que los parámetros estén disponibles
    const { id } = await params;
    
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
    console.error('Error en PUT /api/admin/eventos/[id]/asistentes:', error);
    return NextResponse.json(
      { error: 'Error al actualizar asistencia' },
      { status: 500 }
    );
  }
}
