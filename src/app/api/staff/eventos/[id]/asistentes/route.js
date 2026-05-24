import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireStaff } from '@/lib/auth';

// GET - Obtener asistentes del evento (para staff)
export async function GET(request, { params }) {
  const guard = await requireStaff(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const client = await pool.connect();

  try {
    // Verificar que el usuario es staff del evento
    const staffCheck = await client.query(
      'SELECT id_staff FROM staff_evento WHERE id_evento = $1 AND id_miembro = $2',
      [id, guard.session.id]
    );

    if (staffCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'No tienes permisos para este evento' },
        { status: 403 }
      );
    }

    // Obtener lista de asistentes
    const result = await client.query(
      `SELECT 
        ie.id_inscripcion,
        ie.asistio,
        ie.fecha_inscripcion,
        COALESCE(
          m.nombre || ' ' || m.apellido_paterno || ' ' || COALESCE(m.apellido_materno, ''),
          i.nombre_completo,
          eq.nombre_equipo
        ) as nombre_completo,
        COALESCE(m.correo_electronico, i.correo_electronico) as correo,
        COALESCE(m.numero_ieee, '') as numero_ieee,
        CASE 
          WHEN ie.id_miembro IS NOT NULL THEN 'miembro'
          WHEN ie.id_invitado IS NOT NULL THEN 'invitado'
          WHEN ie.id_equipo IS NOT NULL THEN 'equipo'
        END as tipo
      FROM inscripcion_evento ie
      LEFT JOIN miembro m ON ie.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ie.id_invitado = i.id_invitado
      LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
      WHERE ie.id_evento = $1 AND ie.estado <> 'cancelada'
      ORDER BY ie.fecha_inscripcion DESC`,
      [id]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching asistentes:', error);
    return NextResponse.json(
      { error: 'Error al obtener asistentes' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
