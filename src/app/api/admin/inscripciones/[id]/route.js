import { NextResponse } from 'next/server';
import pool, { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function PATCH(request, { params }) {
  const guard = await requireAdmin(request);
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

  // action: 'toggle_asistencia' | 'toggle_pago'; value debe ser booleano.
  if (typeof value !== 'boolean') {
    return NextResponse.json({ error: 'El campo "value" debe ser booleano' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    let query = '';
    let values = [];

    if (action === 'toggle_asistencia') {
      query = `UPDATE inscripcion_evento SET asistio = $1, hora_registro_asistencia = CASE WHEN $1 = true THEN NOW() ELSE NULL END WHERE id_inscripcion = $2 RETURNING *`;
      values = [value, idNum];
    } else if (action === 'toggle_pago') {
      // If payment is manual, we might want to create a 'pago' record or just update the flag.
      // Schema has 'pago_completado' boolean AND 'pago' table.
      // If we confirm payment manually, we might set 'pago_completado' = true and 'estado' = 'confirmada'.
      // For simplicity in admin manual check:
      query = `UPDATE inscripcion_evento SET pago_completado = $1, estado = CASE WHEN $1 = true THEN 'confirmada' ELSE estado END WHERE id_inscripcion = $2 RETURNING *`;
      values = [value, idNum];
    } else {
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }

    const result = await client.query(query, values);
    
    if (result.rowCount === 0) {
        return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);

  } catch (error) {
    console.error('Error updating inscription:', error);
    return NextResponse.json(
      { error: 'Error al actualizar' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
