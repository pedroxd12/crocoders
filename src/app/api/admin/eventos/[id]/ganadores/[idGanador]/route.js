import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { parseOrError } from '@/lib/validation';

// Edición y baja de un ganador concreto. La posición y el desafío se pueden
// cambiar (los UNIQUE de la tabla impiden duplicar lugar o inscripción).
const ganadorUpdateSchema = z.object({
  posicion: z.coerce.number().int().min(1).max(100).optional(),
  id_reto: z.coerce.number().int().positive().optional().nullable(),
  titulo: z.string().trim().max(120).optional().or(z.literal('')),
  premio: z.string().trim().max(200).optional().or(z.literal('')),
  notas: z.string().trim().max(2000).optional().or(z.literal('')),
}).refine((d) => Object.keys(d).length > 0, { message: 'No hay campos para actualizar' });

const idValido = (id) => Number.isInteger(Number(id)) && Number(id) > 0;

export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id, idGanador } = await params;
  if (!idValido(id) || !idValido(idGanador)) {
    return NextResponse.json({ error: 'Identificadores inválidos' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }
  const [datos, err] = parseOrError(ganadorUpdateSchema, body);
  if (err) return NextResponse.json({ error: err.error }, { status: 400 });

  const client = await connectWithRetry();
  try {
    const actual = await client.query(
      'SELECT * FROM ganador_evento WHERE id_ganador = $1 AND id_evento = $2',
      [idGanador, id],
    );
    if (actual.rows.length === 0) return NextResponse.json({ error: 'Ganador no encontrado' }, { status: 404 });

    const tocaReto = Object.prototype.hasOwnProperty.call(body, 'id_reto');
    if (tocaReto && datos.id_reto != null) {
      const reto = await client.query(
        'SELECT id_reto FROM reto_evento WHERE id_reto = $1 AND id_evento = $2',
        [datos.id_reto, id],
      );
      if (reto.rows.length === 0) {
        return NextResponse.json({ error: 'El desafío no pertenece a este evento.' }, { status: 400 });
      }
    }

    const fila = actual.rows[0];
    await client.query(
      `UPDATE ganador_evento SET
         posicion = $3, id_reto = $4, titulo = $5, premio = $6, notas = $7, updated_at = NOW()
       WHERE id_ganador = $1 AND id_evento = $2`,
      [
        idGanador,
        id,
        datos.posicion ?? fila.posicion,
        tocaReto ? (datos.id_reto ?? null) : fila.id_reto,
        datos.titulo !== undefined ? (datos.titulo || null) : fila.titulo,
        datos.premio !== undefined ? (datos.premio || null) : fila.premio,
        datos.notas !== undefined ? (datos.notas || null) : fila.notas,
      ],
    );
    return NextResponse.json({ message: 'Ganador actualizado' });
  } catch (error) {
    console.error('Error en PUT /api/admin/eventos/[id]/ganadores/[idGanador]:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Esa posición o esa inscripción ya está ocupada en ese desafío (o en la general).' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Error al actualizar el ganador' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id, idGanador } = await params;
  if (!idValido(id) || !idValido(idGanador)) {
    return NextResponse.json({ error: 'Identificadores inválidos' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    const res = await client.query(
      'DELETE FROM ganador_evento WHERE id_ganador = $1 AND id_evento = $2 RETURNING id_ganador',
      [idGanador, id],
    );
    if (res.rowCount === 0) return NextResponse.json({ error: 'Ganador no encontrado' }, { status: 404 });
    return NextResponse.json({ message: 'Ganador eliminado' });
  } catch (error) {
    console.error('Error en DELETE /api/admin/eventos/[id]/ganadores/[idGanador]:', error);
    return NextResponse.json({ error: 'Error al eliminar el ganador' }, { status: 500 });
  } finally {
    client.release();
  }
}
