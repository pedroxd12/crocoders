import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

// GET - Listar sesiones de un programa
export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT 
        sp.*,
        e.nombre as evento_nombre,
        e.fecha_inicio,
        e.hora_inicio,
        e.fecha_fin,
        e.hora_fin,
        e.ubicacion,
        COUNT(DISTINCT ie.id_inscripcion) as total_asistentes,
        COUNT(DISTINCT CASE WHEN ie.asistio = true THEN ie.id_inscripcion END) as asistentes_presentes
      FROM sesion_programa sp
      JOIN evento e ON sp.id_evento = e.id_evento
      LEFT JOIN inscripcion_evento ie ON e.id_evento = ie.id_evento
      WHERE sp.id_programa = $1
      GROUP BY sp.id_sesion, e.id_evento
      ORDER BY sp.numero_sesion`,
      [id]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching sesiones:', error);
    return NextResponse.json(
      { error: 'Error al obtener sesiones' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// POST - Agregar sesión al programa (vincular evento existente)
export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const client = await pool.connect();
  
  try {
    const {
      id_evento,
      numero_sesion,
      titulo,
      descripcion,
      es_obligatoria
    } = await request.json();

    if (!id_evento || !numero_sesion) {
      return NextResponse.json(
        { error: 'id_evento y numero_sesion son requeridos' },
        { status: 400 }
      );
    }

    // Verificar que el evento existe
    const eventoCheck = await client.query(
      'SELECT id_evento FROM evento WHERE id_evento = $1',
      [id_evento]
    );

    if (eventoCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'El evento no existe' },
        { status: 404 }
      );
    }

    const result = await client.query(
      `INSERT INTO sesion_programa (
        id_programa, id_evento, numero_sesion, titulo, descripcion, es_obligatoria
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [id, id_evento, numero_sesion, titulo, descripcion, es_obligatoria !== false]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Error adding sesion:', error);
    if (error.code === '23505') { // Unique violation
      return NextResponse.json(
        { error: 'Ya existe una sesión con ese número o ese evento ya está asignado' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Error al agregar sesión' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
