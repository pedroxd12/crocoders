import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

const PROCEDENCIAS = new Set([
  'club_programacion', 'computer_society', 'itlac',
  'universitario', 'preparatoria', 'otro',
]);

// GET - Lista de jueces del evento.
export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id_juez, id_evento, id_miembro, nombre_completo, correo_electronico,
              numero_telefono, institucion, procedencia, es_principal, created_at
         FROM juez_evento
        WHERE id_evento = $1
        ORDER BY es_principal DESC, nombre_completo`,
      [id],
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching jueces:', error);
    return NextResponse.json({ error: 'Error al obtener jueces' }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST - Agregar un juez al evento. Puede ser miembro (id_miembro) o externo.
export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo no es JSON válido' }, { status: 400 });
  }

  const {
    id_miembro, nombre_completo, correo_electronico,
    numero_telefono, institucion, procedencia, es_principal,
  } = body;

  if (!nombre_completo || !String(nombre_completo).trim()) {
    return NextResponse.json({ error: 'El nombre del juez es requerido' }, { status: 400 });
  }
  const proc = procedencia || 'otro';
  if (!PROCEDENCIAS.has(proc)) {
    return NextResponse.json(
      { error: `procedencia inválida. Use una de: ${[...PROCEDENCIAS].join(', ')}` },
      { status: 400 },
    );
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO juez_evento (
         id_evento, id_miembro, nombre_completo, correo_electronico,
         numero_telefono, institucion, procedencia, es_principal
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        id_miembro ? Number(id_miembro) : null,
        String(nombre_completo).trim(),
        correo_electronico || null,
        numero_telefono || null,
        institucion || null,
        proc,
        Boolean(es_principal),
      ],
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Error adding juez:', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ese miembro ya es juez de este evento' }, { status: 409 });
    }
    if (error.code === '23503') {
      return NextResponse.json({ error: 'El evento o el miembro indicado no existe' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Error al agregar juez' }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE - Quitar un juez (?id_juez=).
export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const idJuez = searchParams.get('id_juez');

  if (!idJuez || isNaN(Number(idJuez))) {
    return NextResponse.json({ error: 'id_juez inválido' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const res = await client.query(
      'DELETE FROM juez_evento WHERE id_juez = $1 AND id_evento = $2 RETURNING id_juez',
      [idJuez, id],
    );
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Juez no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Juez eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting juez:', error);
    return NextResponse.json({ error: 'Error al eliminar juez' }, { status: 500 });
  } finally {
    client.release();
  }
}
