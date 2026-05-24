import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

// GET - Lista de inscritos al programa con su asistencia a ESTA sesión.
export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id, idSesion } = await params;
  if (isNaN(Number(id)) || isNaN(Number(idSesion))) {
    return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
  }
  const client = await pool.connect();
  try {
    // Validar que la sesión pertenezca al programa.
    const sesion = await client.query(
      'SELECT id_sesion FROM sesion_programa WHERE id_sesion = $1 AND id_programa = $2',
      [idSesion, id],
    );
    if (sesion.rows.length === 0) {
      return NextResponse.json({ error: 'Sesión no encontrada en este programa' }, { status: 404 });
    }

    const result = await client.query(
      `SELECT
        ip.id_miembro,
        ip.id_invitado,
        CASE WHEN ip.id_miembro IS NOT NULL THEN 'miembro' ELSE 'invitado' END AS tipo,
        COALESCE(
          TRIM(m.nombre || ' ' || m.apellido_paterno || ' ' || COALESCE(m.apellido_materno, '')),
          i.nombre_completo
        ) AS nombre_completo,
        COALESCE(m.correo_electronico, i.correo_electronico) AS email,
        COALESCE(am.asistio, ai.asistio, false) AS asistio
      FROM inscripcion_programa ip
      LEFT JOIN miembro  m ON ip.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ip.id_invitado = i.id_invitado
      LEFT JOIN asistencia_miembro  am ON am.id_miembro  = ip.id_miembro  AND am.id_sesion = $2
      LEFT JOIN asistencia_invitado ai ON ai.id_invitado = ip.id_invitado AND ai.id_sesion = $2
      WHERE ip.id_programa = $1
      ORDER BY nombre_completo`,
      [id, idSesion],
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching asistencia de sesión:', error);
    return NextResponse.json({ error: 'Error al obtener asistencia' }, { status: 500 });
  } finally {
    client.release();
  }
}

// PUT - Marca/actualiza la asistencia de un inscrito en ESTA sesión (upsert).
export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id, idSesion } = await params;
  if (isNaN(Number(id)) || isNaN(Number(idSesion))) {
    return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo no es JSON válido' }, { status: 400 });
  }

  const { id_miembro, id_invitado, asistio } = body;
  const esMiembro = id_miembro != null;
  const esInvitado = id_invitado != null;

  if (esMiembro === esInvitado) {
    return NextResponse.json(
      { error: 'Debe indicar exactamente uno: id_miembro o id_invitado' },
      { status: 400 },
    );
  }
  if (typeof asistio !== 'boolean') {
    return NextResponse.json({ error: 'asistio debe ser booleano' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // La sesión debe pertenecer al programa.
    const sesion = await client.query(
      'SELECT id_sesion FROM sesion_programa WHERE id_sesion = $1 AND id_programa = $2',
      [idSesion, id],
    );
    if (sesion.rows.length === 0) {
      return NextResponse.json({ error: 'Sesión no encontrada en este programa' }, { status: 404 });
    }

    if (esMiembro) {
      await client.query(
        `INSERT INTO asistencia_miembro (id_sesion, id_miembro, asistio, registrado_en)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id_sesion, id_miembro)
         DO UPDATE SET asistio = EXCLUDED.asistio, registrado_en = NOW()`,
        [idSesion, Number(id_miembro), asistio],
      );
    } else {
      await client.query(
        `INSERT INTO asistencia_invitado (id_sesion, id_invitado, asistio, registrado_en)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id_sesion, id_invitado)
         DO UPDATE SET asistio = EXCLUDED.asistio, registrado_en = NOW()`,
        [idSesion, Number(id_invitado), asistio],
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error registrando asistencia de sesión:', error);
    if (error.code === '23503') {
      return NextResponse.json({ error: 'El usuario indicado no existe' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Error al registrar asistencia' }, { status: 500 });
  } finally {
    client.release();
  }
}
