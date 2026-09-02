// Entrega de playera de un inscrito a un PROGRAMA.
//
// Es una marca por participante y por programa (no por sesión): vive en
// `inscripcion_programa.playera_entregada` (migración 010). El escáner QR la
// marca desde /api/programas/checkin; esto es el equivalente manual del panel,
// para cuando el participante no trae su código.
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

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

  const { id_miembro, id_invitado, entregada } = body;
  const esMiembro = id_miembro != null;
  const esInvitado = id_invitado != null;

  if (esMiembro === esInvitado) {
    return NextResponse.json(
      { error: 'Debe indicar exactamente uno: id_miembro o id_invitado' },
      { status: 400 },
    );
  }
  if (typeof entregada !== 'boolean') {
    return NextResponse.json({ error: 'entregada debe ser booleano' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    const prog = await client.query(
      'SELECT solicitar_talla FROM programa_recurrente WHERE id_programa = $1',
      [id],
    );
    if (prog.rows.length === 0) {
      return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 });
    }
    if (!prog.rows[0].solicitar_talla) {
      return NextResponse.json({ error: 'Este programa no entrega playera.' }, { status: 400 });
    }

    const upd = await client.query(
      `UPDATE inscripcion_programa
          SET playera_entregada = $1,
              hora_entrega_playera = $2,
              updated_at = NOW()
        WHERE id_programa = $3
          AND ${esMiembro ? 'id_miembro' : 'id_invitado'} = $4
          AND estado <> 'cancelada'`,
      [entregada, entregada ? new Date() : null, id, esMiembro ? Number(id_miembro) : Number(id_invitado)],
    );
    if (upd.rowCount === 0) {
      return NextResponse.json(
        { error: 'El usuario no está inscrito (activo) en este programa' },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error al registrar la entrega de playera:', error);
    return NextResponse.json({ error: 'Error al registrar la entrega' }, { status: 500 });
  } finally {
    client.release();
  }
}
