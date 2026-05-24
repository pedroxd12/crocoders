import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();
    // Incluye los tres tipos de inscripción: miembro, invitado y equipo.
    // Para equipos se muestra el nombre del equipo y el nº de integrantes.
    const query = `
      SELECT
        ie.id_inscripcion,
        ie.estado,
        ie.asistio,
        ie.pago_completado,
        e.tiene_costo AS requiere_pago,
        ie.fecha_inscripcion,
        ie.id_equipo,
        CASE
            WHEN m.id_miembro IS NOT NULL THEN TRIM(CONCAT(m.nombre, ' ', m.apellido_paterno, ' ', COALESCE(m.apellido_materno, '')))
            WHEN i.id_invitado IS NOT NULL THEN i.nombre_completo
            WHEN eq.id_equipo IS NOT NULL THEN eq.nombre_equipo
        END as nombre_completo,
        CASE
            WHEN m.id_miembro IS NOT NULL THEN m.correo_electronico
            WHEN i.id_invitado IS NOT NULL THEN i.correo_electronico
            WHEN eq.id_equipo IS NOT NULL THEN eq.correo_asesor
        END as correo,
        CASE
            WHEN m.id_miembro IS NOT NULL THEN 'Miembro'
            WHEN i.id_invitado IS NOT NULL THEN 'Invitado'
            WHEN eq.id_equipo IS NOT NULL THEN 'Equipo'
        END as tipo_usuario,
        CASE WHEN eq.id_equipo IS NOT NULL
             THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = eq.id_equipo)
             ELSE NULL END as integrantes_equipo,
        m.numero_ieee,
        e.nombre as nombre_evento,
        e.fecha_inicio
      FROM inscripcion_evento ie
      LEFT JOIN miembro m ON ie.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ie.id_invitado = i.id_invitado
      LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
      JOIN evento e ON ie.id_evento = e.id_evento
      WHERE ie.id_evento = $1 AND ie.estado <> 'cancelada'
      ORDER BY ie.fecha_inscripcion DESC
    `;

    const result = await client.query(query, [id]);

    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('Error fetching asistentes:', error);
    return NextResponse.json(
      { error: 'Error al obtener asistentes' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}
