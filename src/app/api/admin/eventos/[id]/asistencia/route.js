import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const { id_asistente, es_miembro, asistio } = await request.json();

    if (!id || !id_asistente || typeof asistio !== 'boolean') {
      return NextResponse.json(
        { error: 'Parámetros requeridos faltantes o inválidos' },
        { status: 400 },
      );
    }

    const idEvento = Number(id);
    const idAsistente = Number(id_asistente);
    if (!Number.isInteger(idEvento) || !Number.isInteger(idAsistente)) {
      return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
    }

    const targetCol = es_miembro ? 'id_miembro' : 'id_invitado';
    const result = es_miembro
      ? await sql`
          UPDATE inscripcion_evento
             SET asistio = ${asistio},
                 hora_registro_asistencia = CASE WHEN ${asistio} THEN NOW() ELSE NULL END,
                 updated_at = NOW()
           WHERE id_evento = ${idEvento} AND id_miembro = ${idAsistente}
        RETURNING id_inscripcion
        `
      : await sql`
          UPDATE inscripcion_evento
             SET asistio = ${asistio},
                 hora_registro_asistencia = CASE WHEN ${asistio} THEN NOW() ELSE NULL END,
                 updated_at = NOW()
           WHERE id_evento = ${idEvento} AND id_invitado = ${idAsistente}
        RETURNING id_inscripcion
        `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en PUT /api/admin/eventos/[id]/asistencia:', error);
    return NextResponse.json({ error: 'Error al actualizar asistencia' }, { status: 500 });
  }
}
