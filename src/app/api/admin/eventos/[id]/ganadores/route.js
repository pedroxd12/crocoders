import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { listarGanadores } from '@/lib/ganadores';
import { parseOrError } from '@/lib/validation';

// Ganadores de un evento (tabla ganador_evento, migración 015).
//
//   GET    → { publicado, general: [...], retos: [{ ...reto, ganadores }] }
//   POST   → alta de un ganador: { id_inscripcion, id_reto|null, posicion, titulo, premio, notas }
//   PATCH  → { resultados_publicados: bool } publica/oculta los resultados en la web

const ganadorSchema = z.object({
  id_inscripcion: z.coerce.number().int().positive(),
  id_reto: z.coerce.number().int().positive().optional().nullable(),
  posicion: z.coerce.number().int().min(1, 'La posición debe ser 1 o mayor').max(100),
  titulo: z.string().trim().max(120, 'Máximo 120 caracteres').optional().or(z.literal('')),
  premio: z.string().trim().max(200, 'Máximo 200 caracteres').optional().or(z.literal('')),
  notas: z.string().trim().max(2000).optional().or(z.literal('')),
});

const idValido = (id) => Number.isInteger(Number(id)) && Number(id) > 0;

export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!idValido(id)) return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });

  const client = await connectWithRetry();
  try {
    const ev = await client.query(
      'SELECT id_evento, nombre, resultados_publicados FROM evento WHERE id_evento = $1 AND deleted_at IS NULL',
      [id],
    );
    if (ev.rows.length === 0) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });

    const ganadores = await listarGanadores(client, id);
    return NextResponse.json({
      publicado: Boolean(ev.rows[0].resultados_publicados),
      ...ganadores,
    });
  } catch (error) {
    console.error('Error en GET /api/admin/eventos/[id]/ganadores:', error);
    return NextResponse.json({ error: 'Error al obtener los ganadores' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!idValido(id)) return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }
  const [datos, err] = parseOrError(ganadorSchema, body);
  if (err) return NextResponse.json({ error: err.error }, { status: 400 });

  const client = await connectWithRetry();
  try {
    // La inscripción tiene que ser de ESTE evento y estar viva: premiar a un
    // equipo que se dio de baja (o de otro evento) no tiene sentido.
    const ins = await client.query(
      `SELECT id_inscripcion, estado FROM inscripcion_evento WHERE id_inscripcion = $1 AND id_evento = $2`,
      [datos.id_inscripcion, id],
    );
    if (ins.rows.length === 0) {
      return NextResponse.json({ error: 'La inscripción no pertenece a este evento.' }, { status: 400 });
    }
    if (ins.rows[0].estado === 'cancelada') {
      return NextResponse.json({ error: 'Esa inscripción está cancelada; no se puede premiar.' }, { status: 400 });
    }
    if (datos.id_reto != null) {
      const reto = await client.query(
        'SELECT id_reto FROM reto_evento WHERE id_reto = $1 AND id_evento = $2',
        [datos.id_reto, id],
      );
      if (reto.rows.length === 0) {
        return NextResponse.json({ error: 'El desafío no pertenece a este evento.' }, { status: 400 });
      }
    }

    const res = await client.query(
      `INSERT INTO ganador_evento (id_evento, id_reto, id_inscripcion, posicion, titulo, premio, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id_ganador`,
      [
        id,
        datos.id_reto ?? null,
        datos.id_inscripcion,
        datos.posicion,
        datos.titulo || null,
        datos.premio || null,
        datos.notas || null,
      ],
    );
    return NextResponse.json({ message: 'Ganador registrado', id_ganador: res.rows[0].id_ganador }, { status: 201 });
  } catch (error) {
    console.error('Error en POST /api/admin/eventos/[id]/ganadores:', error);
    if (error.code === '23505') {
      const c = String(error.constraint || '');
      return NextResponse.json(
        {
          error: c.includes('posicion')
            ? 'Esa posición ya tiene ganador en este desafío (o en la general). Elige otra o edita el existente.'
            : 'Esa inscripción ya está premiada en este desafío (o en la general).',
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Error al registrar el ganador' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!idValido(id)) return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }
  if (typeof body?.resultados_publicados !== 'boolean') {
    return NextResponse.json({ error: 'resultados_publicados debe ser booleano' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    if (body.resultados_publicados) {
      const total = await client.query('SELECT COUNT(*)::int AS n FROM ganador_evento WHERE id_evento = $1', [id]);
      if (total.rows[0].n === 0) {
        return NextResponse.json({ error: 'Registra al menos un ganador antes de publicar los resultados.' }, { status: 400 });
      }
    }
    const res = await client.query(
      `UPDATE evento SET resultados_publicados = $2, updated_at = NOW()
        WHERE id_evento = $1 AND deleted_at IS NULL RETURNING resultados_publicados`,
      [id, body.resultados_publicados],
    );
    if (res.rowCount === 0) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    return NextResponse.json({ success: true, resultados_publicados: res.rows[0].resultados_publicados });
  } catch (error) {
    console.error('Error en PATCH /api/admin/eventos/[id]/ganadores:', error);
    return NextResponse.json({ error: 'Error al actualizar la publicación' }, { status: 500 });
  } finally {
    client.release();
  }
}
