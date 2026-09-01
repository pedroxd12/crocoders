import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

// Las bajas son lógicas (estado = 'cancelada'): la fila permanece y sigue ocupando
// el UNIQUE (id_programa, id_miembro) / (id_programa, id_invitado). Por eso hay que
// reactivar con ON CONFLICT, igual que la ruta pública de inscripción; un INSERT a
// secas chocaba con el UNIQUE y devolvía un 409 "ya está inscrito" que era falso.
// El ON CONFLICT nombra el CONSTRAINT (no las columnas) porque no es un índice
// parcial y Postgres no lo encontraría por lista de columnas (error 42P10).
const UPSERT = {
  miembro: `
    INSERT INTO inscripcion_programa (id_programa, id_miembro, estado, fecha_inscripcion)
    VALUES ($1, $2, 'activo', NOW())
    ON CONFLICT ON CONSTRAINT inscripcion_programa_id_programa_id_miembro_key
    DO UPDATE SET estado = 'activo', updated_at = NOW()
    RETURNING *, (xmax = 0) AS insertada`,
  invitado: `
    INSERT INTO inscripcion_programa (id_programa, id_invitado, estado, fecha_inscripcion)
    VALUES ($1, $2, 'activo', NOW())
    ON CONFLICT ON CONSTRAINT inscripcion_programa_id_programa_id_invitado_key
    DO UPDATE SET estado = 'activo', updated_at = NOW()
    RETURNING *, (xmax = 0) AS insertada`,
};

function validarEntrada(id, id_miembro, id_invitado) {
  if (!id || isNaN(Number(id))) return 'ID de programa inválido';
  const esMiembro = id_miembro != null;
  const esInvitado = id_invitado != null;
  if (esMiembro === esInvitado) {
    return 'Debe proporcionar id_miembro o id_invitado, pero no ambos';
  }
  if (esMiembro && !Number.isInteger(Number(id_miembro))) return 'id_miembro debe ser numérico';
  if (esInvitado && !Number.isInteger(Number(id_invitado))) return 'id_invitado debe ser numérico';
  return null;
}

// POST - Inscribir (o reinscribir) usuario a un programa
export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const client = await connectWithRetry();

  try {
    const { id_miembro, id_invitado } = await request.json();

    const error = validarEntrada(id, id_miembro, id_invitado);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const esMiembro = id_miembro != null;

    const programaCheck = await client.query(
      'SELECT id_programa FROM programa_recurrente WHERE id_programa = $1',
      [id],
    );
    if (programaCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 });
    }

    // Estado previo, para poder decir si esto fue un alta o una reactivación.
    const previa = await client.query(
      `SELECT estado FROM inscripcion_programa
        WHERE id_programa = $1 AND ${esMiembro ? 'id_miembro' : 'id_invitado'} = $2`,
      [id, Number(esMiembro ? id_miembro : id_invitado)],
    );
    if (previa.rows.length > 0 && previa.rows[0].estado !== 'cancelada') {
      return NextResponse.json(
        { error: 'El usuario ya está inscrito en este programa' },
        { status: 409 },
      );
    }

    const result = await client.query(
      esMiembro ? UPSERT.miembro : UPSERT.invitado,
      [id, Number(esMiembro ? id_miembro : id_invitado)],
    );

    const reactivada = result.rows[0].insertada === false;
    return NextResponse.json(
      {
        ...result.rows[0],
        reactivada,
        message: reactivada
          ? 'Se reactivó la inscripción que el usuario había cancelado'
          : 'Usuario inscrito al programa',
      },
      { status: reactivada ? 200 : 201 },
    );
  } catch (error) {
    console.error('Error inscribing to programa:', error);
    if (error.code === '23503') { // FK violation
      return NextResponse.json(
        { error: 'El miembro o invitado indicado no existe' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Error al inscribir usuario' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// DELETE - Dar de baja a un inscrito (baja lógica, como la del propio usuario).
// Sin esto el panel no tenía forma de quitar a nadie de un programa.
export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const client = await connectWithRetry();

  try {
    const { id_miembro, id_invitado } = await request.json();

    const error = validarEntrada(id, id_miembro, id_invitado);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const esMiembro = id_miembro != null;

    // Baja lógica: se conserva la fila (y su historial de asistencia) para no
    // perder el registro de quién pasó por el programa.
    const res = await client.query(
      `UPDATE inscripcion_programa
          SET estado = 'cancelada', updated_at = NOW()
        WHERE id_programa = $1
          AND ${esMiembro ? 'id_miembro' : 'id_invitado'} = $2
          AND estado <> 'cancelada'
        RETURNING id_inscripcion_programa`,
      [id, Number(esMiembro ? id_miembro : id_invitado)],
    );

    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: 'No se encontró una inscripción activa para dar de baja' },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: 'Inscripción dada de baja' });
  } catch (error) {
    console.error('Error dando de baja inscripción a programa:', error);
    return NextResponse.json({ error: 'Error al dar de baja la inscripción' }, { status: 500 });
  } finally {
    client.release();
  }
}
