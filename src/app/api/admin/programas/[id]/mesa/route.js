// Mesa o lugar de un inscrito a un PROGRAMA (migración 015).
//
// Es una marca por participante y por programa: vive en
// `inscripcion_programa.mesa`. Sólo se acepta si el programa reparte mesas
// (`programa_recurrente.asignar_mesas`). Mismo contrato que /playera.
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

const MAX_MESA = 40;

export async function PATCH(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!Number.isInteger(Number(id))) {
    return NextResponse.json({ error: 'ID de programa inválido' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo no es JSON válido' }, { status: 400 });
  }

  const { id_miembro, id_invitado } = body;
  const esMiembro = id_miembro != null;
  const esInvitado = id_invitado != null;
  if (esMiembro === esInvitado) {
    return NextResponse.json(
      { error: 'Debe indicar exactamente uno: id_miembro o id_invitado' },
      { status: 400 },
    );
  }
  const mesa = body.mesa == null ? null : String(body.mesa).trim().slice(0, MAX_MESA) || null;

  const client = await connectWithRetry();
  try {
    const prog = await client.query(
      'SELECT asignar_mesas FROM programa_recurrente WHERE id_programa = $1',
      [id],
    );
    if (prog.rows.length === 0) {
      return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 });
    }
    if (!prog.rows[0].asignar_mesas) {
      return NextResponse.json({ error: 'Este programa no reparte mesas.' }, { status: 400 });
    }

    const upd = await client.query(
      `UPDATE inscripcion_programa
          SET mesa = $1, updated_at = NOW()
        WHERE id_programa = $2
          AND ${esMiembro ? 'id_miembro' : 'id_invitado'} = $3
          AND estado <> 'cancelada'`,
      [mesa, id, esMiembro ? Number(id_miembro) : Number(id_invitado)],
    );
    if (upd.rowCount === 0) {
      return NextResponse.json(
        { error: 'El usuario no está inscrito (activo) en este programa' },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, mesa });
  } catch (error) {
    console.error('Error al asignar la mesa:', error);
    return NextResponse.json({ error: 'Error al asignar la mesa' }, { status: 500 });
  } finally {
    client.release();
  }
}
