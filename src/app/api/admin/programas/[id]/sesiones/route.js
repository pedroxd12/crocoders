import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

// GET - Listar sesiones de un programa (con su asistencia agregada)
export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de programa inválido' }, { status: 400 });
  }
  const client = await pool.connect();

  try {
    // total_inscritos = inscritos al PROGRAMA (denominador de asistencia).
    // asistentes_presentes = quienes tienen asistio=true en ESTA sesión,
    // sumando miembros e invitados.
    const result = await client.query(
      `SELECT
        sp.*,
        (SELECT COUNT(*) FROM inscripcion_programa WHERE id_programa = sp.id_programa)::int AS total_inscritos,
        (
          COALESCE((SELECT COUNT(*) FROM asistencia_miembro  am WHERE am.id_sesion = sp.id_sesion AND am.asistio), 0) +
          COALESCE((SELECT COUNT(*) FROM asistencia_invitado ai WHERE ai.id_sesion = sp.id_sesion AND ai.asistio), 0)
        )::int AS asistentes_presentes
      FROM sesion_programa sp
      WHERE sp.id_programa = $1
      ORDER BY sp.numero_sesion`,
      [id],
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching sesiones:', error);
    return NextResponse.json({ error: 'Error al obtener sesiones' }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST - Agregar una sesión manual al programa (fecha/hora propias, sin evento espejo)
export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de programa inválido' }, { status: 400 });
  }
  const client = await pool.connect();

  try {
    const {
      numero_sesion,
      titulo,
      descripcion,
      fecha,
      hora_inicio,
      hora_fin,
      ubicacion,
      es_obligatoria,
    } = await request.json();

    // numero_sesion: si no llega, calcular el siguiente.
    let numero = parseInt(numero_sesion);
    if (!Number.isInteger(numero) || numero <= 0) {
      const maxRes = await client.query(
        'SELECT COALESCE(MAX(numero_sesion), 0)::int AS max FROM sesion_programa WHERE id_programa = $1',
        [id],
      );
      numero = maxRes.rows[0].max + 1;
    }

    if (!fecha) {
      return NextResponse.json({ error: 'La fecha de la sesión es requerida' }, { status: 400 });
    }

    const result = await client.query(
      `INSERT INTO sesion_programa (
        id_programa, numero_sesion, titulo, descripcion,
        fecha, hora_inicio, hora_fin, ubicacion, es_obligatoria
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        id,
        numero,
        titulo || `Sesión ${numero}`,
        descripcion || null,
        fecha,
        hora_inicio || null,
        hora_fin || null,
        ubicacion || null,
        es_obligatoria !== false,
      ],
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Error adding sesion:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe una sesión con ese número en el programa' },
        { status: 409 },
      );
    }
    if (error.code === '23503') {
      return NextResponse.json({ error: 'El programa no existe' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Error al agregar sesión' }, { status: 500 });
  } finally {
    client.release();
  }
}
