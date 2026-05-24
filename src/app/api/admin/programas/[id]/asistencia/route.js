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

    // La elegibilidad se mide contra las sesiones OBLIGATORIAS del programa y
    // los requisitos configurados (nº mínimo de sesiones y % mínimo de asistencia).
    const result = await client.query(
      `
      WITH prog AS (
        SELECT sesiones_requeridas_certificado, porcentaje_asistencia_minimo
          FROM programa_recurrente WHERE id_programa = $1
      ),
      sesiones AS (
        SELECT COUNT(*) FILTER (WHERE es_obligatoria)::int AS total_obligatorias,
               COUNT(*)::int AS total
          FROM sesion_programa
         WHERE id_programa = $1
      ),
      asistencia_miembros AS (
        SELECT am.id_miembro,
               COUNT(*) FILTER (WHERE am.asistio AND sp.es_obligatoria)::int AS asistencias
          FROM asistencia_miembro am
          JOIN sesion_programa sp ON am.id_sesion = sp.id_sesion
         WHERE sp.id_programa = $1
         GROUP BY am.id_miembro
      ),
      asistencia_invitados AS (
        SELECT ai.id_invitado,
               COUNT(*) FILTER (WHERE ai.asistio AND sp.es_obligatoria)::int AS asistencias
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
        -- alias que consume el frontend
        COALESCE(am.asistencias, ai.asistencias, 0) AS sesiones_asistidas,
        s.total_obligatorias AS total_sesiones,
        CASE WHEN s.total_obligatorias > 0
             THEN ROUND(100.0 * COALESCE(am.asistencias, ai.asistencias, 0) / s.total_obligatorias, 2)
             ELSE 0
        END AS porcentaje_asistencia,
        -- Elegible: cumple el nº mínimo de sesiones Y el % mínimo de asistencia.
        (
          COALESCE(am.asistencias, ai.asistencias, 0) >= GREATEST(p.sesiones_requeridas_certificado, 0)
          AND s.total_obligatorias > 0
          AND (100.0 * COALESCE(am.asistencias, ai.asistencias, 0) / s.total_obligatorias) >= p.porcentaje_asistencia_minimo
        ) AS elegible_certificado,
        -- La emisión se materializa en inscripcion_programa.
        ip.certificado_emitido,
        ip.fecha_certificado
      FROM inscripcion_programa ip
      CROSS JOIN sesiones s
      CROSS JOIN prog p
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

// POST - Emitir certificado a un inscrito. Valida elegibilidad en el servidor.
export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de programa inválido' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo no es JSON válido' }, { status: 400 });
  }

  const { id_miembro, id_invitado } = body;
  const esMiembro = id_miembro != null;
  const esInvitado = id_invitado != null;
  if (esMiembro === esInvitado) {
    return NextResponse.json(
      { error: 'Debe indicar exactamente uno: id_miembro o id_invitado' },
      { status: 400 },
    );
  }

  const client = await pool.connect();
  try {
    // Recalcular elegibilidad en el servidor (no confiar en el cliente).
    const elegibleRes = await client.query(
      `
      WITH prog AS (
        SELECT sesiones_requeridas_certificado, porcentaje_asistencia_minimo
          FROM programa_recurrente WHERE id_programa = $1
      ),
      sesiones AS (
        SELECT COUNT(*) FILTER (WHERE es_obligatoria)::int AS total_obligatorias
          FROM sesion_programa WHERE id_programa = $1
      ),
      asis AS (
        SELECT COUNT(*) FILTER (WHERE a.asistio AND sp.es_obligatoria)::int AS asistencias
          FROM sesion_programa sp
          LEFT JOIN (
            SELECT id_sesion, asistio FROM asistencia_miembro  WHERE id_miembro  = $2
            UNION ALL
            SELECT id_sesion, asistio FROM asistencia_invitado WHERE id_invitado = $3
          ) a ON a.id_sesion = sp.id_sesion
         WHERE sp.id_programa = $1
      )
      SELECT
        asis.asistencias,
        CASE WHEN sesiones.total_obligatorias > 0
             THEN ROUND(100.0 * asis.asistencias / sesiones.total_obligatorias, 2)
             ELSE 0 END AS porcentaje,
        (asis.asistencias >= GREATEST(prog.sesiones_requeridas_certificado, 0)
         AND sesiones.total_obligatorias > 0
         AND (100.0 * asis.asistencias / sesiones.total_obligatorias) >= prog.porcentaje_asistencia_minimo
        ) AS elegible
      FROM prog CROSS JOIN sesiones CROSS JOIN asis
      `,
      [id, esMiembro ? Number(id_miembro) : null, esInvitado ? Number(id_invitado) : null],
    );

    if (elegibleRes.rows.length === 0 || !elegibleRes.rows[0].elegible) {
      return NextResponse.json(
        { error: 'El usuario no cumple los requisitos para certificado' },
        { status: 400 },
      );
    }

    const { asistencias, porcentaje } = elegibleRes.rows[0];

    // Materializar en inscripcion_programa (esquema real). Solo si no estaba emitido.
    const col = esMiembro ? 'id_miembro' : 'id_invitado';
    const upd = await client.query(
      `UPDATE inscripcion_programa
          SET sesiones_asistidas = $3,
              porcentaje_asistencia = $4,
              elegible_certificado = TRUE,
              certificado_emitido = TRUE,
              fecha_certificado = NOW(),
              updated_at = NOW()
        WHERE id_programa = $1 AND ${col} = $2 AND certificado_emitido = FALSE
        RETURNING id_inscripcion_programa, fecha_certificado`,
      [id, esMiembro ? Number(id_miembro) : null, asistencias, porcentaje],
    );

    if (upd.rowCount === 0) {
      // O no está inscrito, o ya tenía certificado emitido.
      const existe = await client.query(
        `SELECT certificado_emitido FROM inscripcion_programa WHERE id_programa = $1 AND ${col} = $2`,
        [id, esMiembro ? Number(id_miembro) : null],
      );
      if (existe.rows.length === 0) {
        return NextResponse.json({ error: 'El usuario no está inscrito en el programa' }, { status: 404 });
      }
      return NextResponse.json({ error: 'El certificado ya fue emitido', code: 'YA_EMITIDO' }, { status: 409 });
    }

    return NextResponse.json(
      { success: true, fecha_certificado: upd.rows[0].fecha_certificado },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error emitiendo certificado:', error);
    return NextResponse.json({ error: 'Error al emitir certificado' }, { status: 500 });
  } finally {
    client.release();
  }
}
