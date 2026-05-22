import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

// GET - Reporte de asistencia del programa
export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;

  let client;
  try {
    client = await pool.connect();

    const result = await client.query(
      `
      WITH sesiones AS (
        SELECT COUNT(*)::int AS total
          FROM sesion_programa
         WHERE id_programa = $1
      ),
      asistencia_miembros AS (
        SELECT am.id_miembro,
               COUNT(*) FILTER (WHERE am.asistio)::int AS asistencias
          FROM asistencia_miembro am
          JOIN sesion_programa sp ON am.id_sesion = sp.id_sesion
         WHERE sp.id_programa = $1
         GROUP BY am.id_miembro
      ),
      asistencia_invitados AS (
        SELECT ai.id_invitado,
               COUNT(*) FILTER (WHERE ai.asistio)::int AS asistencias
          FROM asistencia_invitado ai
          JOIN sesion_programa sp ON ai.id_sesion = sp.id_sesion
         WHERE sp.id_programa = $1
         GROUP BY ai.id_invitado
      )
      SELECT
        ip.id_inscripcion_programa,
        ip.id_programa,
        ip.id_miembro,
        ip.id_invitado,
        ip.fecha_inscripcion,
        COALESCE(
          TRIM(m.nombre || ' ' || m.apellido_paterno || ' ' || COALESCE(m.apellido_materno, '')),
          i.nombre_completo
        ) AS nombre_completo,
        COALESCE(m.correo_electronico, i.correo_electronico) AS email,
        COALESCE(m.numero_telefono, i.numero_telefono) AS telefono,
        CASE WHEN ip.id_miembro IS NOT NULL THEN 'miembro' ELSE 'invitado' END AS tipo,
        COALESCE(am.asistencias, ai.asistencias, 0) AS asistencias,
        s.total AS total_sesiones,
        CASE WHEN s.total > 0
             THEN ROUND(100.0 * COALESCE(am.asistencias, ai.asistencias, 0) / s.total, 2)
             ELSE 0
        END AS porcentaje_asistencia
      FROM inscripcion_programa ip
      CROSS JOIN sesiones s
      LEFT JOIN miembro m ON ip.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ip.id_invitado = i.id_invitado
      LEFT JOIN asistencia_miembros am ON am.id_miembro = ip.id_miembro
      LEFT JOIN asistencia_invitados ai ON ai.id_invitado = ip.id_invitado
      WHERE ip.id_programa = $1
      ORDER BY porcentaje_asistencia DESC, nombre_completo
      `,
      [id],
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching asistencia:', error);
    return NextResponse.json({ error: 'Error al obtener reporte de asistencia' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
