// PATCH /api/eventos/inscripciones/[id]
// Marcas manuales sobre una inscripción desde la lista: asistencia y pago.
//
// Vivía en /api/admin/inscripciones/[id] con requireAdmin. Se movió aquí
// porque ahora también lo usa el panel de staff: el gate es "administrador O
// staff de ESTE evento con rol de gestión (puede_administrar)", la misma
// convención que /api/eventos/comprobantes/[id] (fuera de /api/admin porque no
// es sólo para administradores). Ver src/lib/roles-staff.js.
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { autorizarStaffEvento } from '@/lib/checkin-eventos';

export async function PATCH(request, { params }) {
  const guard = await requireAuth(request);
  if (!guard.ok) return guard.response;

  const { id } = await params; // id_inscripcion
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ error: 'ID de inscripción inválido' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo no es JSON válido' }, { status: 400 });
  }
  const { action, value } = body;

  // action: 'toggle_asistencia' | 'toggle_pago' (value booleano) |
  //         'set_mesa' (value: texto corto o null para quitarla).
  const ACCIONES = ['toggle_asistencia', 'toggle_pago', 'set_mesa'];
  if (!ACCIONES.includes(action)) {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }
  if (action !== 'set_mesa' && typeof value !== 'boolean') {
    return NextResponse.json({ error: 'El campo "value" debe ser booleano' }, { status: 400 });
  }
  if (action === 'set_mesa' && value !== null && typeof value !== 'string') {
    return NextResponse.json({ error: 'La mesa debe ser un texto (o null para quitarla)' }, { status: 400 });
  }
  const mesa = action === 'set_mesa' ? (String(value ?? '').trim().slice(0, 40) || null) : null;

  const client = await connectWithRetry();
  try {
    const { rows: filas } = await client.query(
      `SELECT ie.id_evento, ie.id_equipo, e.asignar_mesas
         FROM inscripcion_evento ie
         JOIN evento e ON e.id_evento = ie.id_evento
        WHERE ie.id_inscripcion = $1`,
      [idNum],
    );
    const inscripcion = filas[0];
    if (!inscripcion) {
      return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 });
    }

    const permiso = await autorizarStaffEvento(client, guard.session, inscripcion.id_evento, { nivel: 'gestion' });
    if (!permiso.ok) {
      return NextResponse.json({ error: permiso.error }, { status: permiso.status });
    }

    // La asistencia de un equipo se lleva POR INTEGRANTE (migración 009) y
    // `inscripcion_evento.asistio` es su agregado, recalculado por
    // /api/eventos/checkin. Tocarlo a mano lo desincronizaría de las marcas
    // por persona, así que se rechaza (la UI tampoco lo ofrece).
    if (action === 'toggle_asistencia' && inscripcion.id_equipo != null) {
      return NextResponse.json(
        { error: 'La asistencia de un equipo se marca por integrante desde el escáner QR.' },
        { status: 400 },
      );
    }

    if (action === 'set_mesa') {
      if (!inscripcion.asignar_mesas) {
        return NextResponse.json(
          { error: 'Este evento no reparte mesas. Actívalo en la configuración del evento.' },
          { status: 400 },
        );
      }
      const res = await client.query(
        'UPDATE inscripcion_evento SET mesa = $1, updated_at = NOW() WHERE id_inscripcion = $2 RETURNING id_inscripcion, mesa',
        [mesa, idNum],
      );
      return NextResponse.json(res.rows[0]);
    }

    const query =
      action === 'toggle_asistencia'
        ? `UPDATE inscripcion_evento
              SET asistio = $1,
                  hora_registro_asistencia = CASE WHEN $1 = true THEN NOW() ELSE NULL END
            WHERE id_inscripcion = $2
            RETURNING *`
        // Confirmar el pago a mano confirma la inscripción; retirarlo no la
        // cancela (misma regla que la revisión de comprobantes).
        : `UPDATE inscripcion_evento
              SET pago_completado = $1,
                  estado = CASE WHEN $1 = true THEN 'confirmada' ELSE estado END
            WHERE id_inscripcion = $2
            RETURNING *`;

    const result = await client.query(query, [value, idNum]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating inscription:', error);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  } finally {
    client.release();
  }
}
