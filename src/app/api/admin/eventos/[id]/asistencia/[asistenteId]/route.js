import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { id, asistenteId } = await params;
    const url = new URL(request.url);
    const esMiembro = url.searchParams.get('tipo') === 'miembro';

    if (!id || !asistenteId) {
      return NextResponse.json({ error: 'Parámetros requeridos faltantes' }, { status: 400 });
    }

    const idEvento = Number(id);
    const idAsistente = Number(asistenteId);
    if (!Number.isInteger(idEvento) || !Number.isInteger(idAsistente)) {
      return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
    }

    const [asistente] = esMiembro
      ? await sql`
          SELECT m.id_miembro, m.nombre, m.apellido_paterno, m.apellido_materno,
                 m.correo_electronico, ie.asistio, ie.hora_registro_asistencia
            FROM inscripcion_evento ie
            JOIN miembro m ON ie.id_miembro = m.id_miembro
           WHERE ie.id_evento = ${idEvento} AND ie.id_miembro = ${idAsistente}
        `
      : await sql`
          SELECT i.id_invitado, i.nombre_completo, i.correo_electronico,
                 ie.asistio, ie.hora_registro_asistencia
            FROM inscripcion_evento ie
            JOIN invitado i ON ie.id_invitado = i.id_invitado
           WHERE ie.id_evento = ${idEvento} AND ie.id_invitado = ${idAsistente}
        `;

    return NextResponse.json({
      registrado: !!asistente,
      asistente: asistente || null,
    });
  } catch (error) {
    console.error('Error en GET /api/admin/eventos/[id]/asistencia/[asistenteId]:', error);
    return NextResponse.json({ error: 'Error al verificar asistencia' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { id, asistenteId } = await params;
    const { es_miembro, asistio } = await request.json();

    if (!id || !asistenteId || typeof asistio !== 'boolean') {
      return NextResponse.json(
        { error: 'Parámetros requeridos faltantes o inválidos' },
        { status: 400 },
      );
    }

    const idEvento = Number(id);
    const idAsistente = Number(asistenteId);
    if (!Number.isInteger(idEvento) || !Number.isInteger(idAsistente)) {
      return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
    }

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
    console.error('Error en PUT /api/admin/eventos/[id]/asistencia/[asistenteId]:', error);
    return NextResponse.json({ error: 'Error al actualizar asistencia' }, { status: 500 });
  }
}
