import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';

// GET - Obtener eventos donde el usuario es staff.
// Gate: autenticado; la consulta filtra por pertenencia a staff_evento, así que
// un usuario sin asignaciones recibe una lista vacía (no requiere rol global).
export async function GET(request) {
  const guard = await requireAuth(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    client = await connectWithRetry();
    const id_miembro = guard.session.id;

    const result = await client.query(
      `SELECT
        e.id_evento,
        e.nombre,
        e.descripcion_html AS descripcion,
        -- fecha_inicio/fecha_fin son de tipo date: pg las convierte en Date y
        -- NextResponse.json las serializa como ISO completo
        -- ("2026-08-31T06:00:00.000Z"). El cliente las concatenaba con la hora
        -- ("...ZT18:00:00") y obtenía Invalid Date, por lo que TODOS los eventos
        -- se clasificaban como "Finalizado". Se devuelven ya como texto.
        to_char(e.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
        to_char(e.fecha_fin,    'YYYY-MM-DD') AS fecha_fin,
        -- Las horas NO necesitan to_char: el tipo time no tiene parser en el
        -- driver y llega ya como texto ("18:00:00"). Envolverlas dependía de un
        -- cast implícito time-interval para elegir la sobrecarga de to_char,
        -- riesgo gratuito en la consulta de la que cuelga todo el panel de
        -- staff. El recorte a "18:00" lo hace formatearHora() en el cliente.
        e.hora_inicio,
        e.hora_fin,
        e.ubicacion,
        e.estado,
        e.cupos,
        e.cupos_disponibles,
        e.imagen_flyer_url AS imagen_url,
        te.nombre as tipo_evento,
        ae.nombre as alcance,
        r.nombre as mi_rol,
        r.id_rol,
        r.puede_administrar,
        r.puede_editar,
        r.puede_ver,
        COUNT(DISTINCT ie.id_inscripcion) as total_inscritos,
        COUNT(DISTINCT CASE WHEN ie.asistio = true THEN ie.id_inscripcion END) as total_asistieron
      FROM staff_evento se
      JOIN evento e ON se.id_evento = e.id_evento
      JOIN catalogo_rol_staff r ON se.id_rol = r.id_rol
      LEFT JOIN catalogo_tipo_evento te ON e.id_tipo_evento = te.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento ae ON e.id_alcance = ae.id_alcance
      LEFT JOIN inscripcion_evento ie ON e.id_evento = ie.id_evento AND ie.estado <> 'cancelada'
      WHERE se.id_miembro = $1 AND e.deleted_at IS NULL
      GROUP BY e.id_evento, te.nombre, ae.nombre, r.nombre, r.id_rol, r.puede_administrar, r.puede_editar, r.puede_ver
      ORDER BY e.fecha_inicio DESC`,
      [id_miembro]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching staff eventos:', error);
    return NextResponse.json(
      { error: 'Error al obtener eventos' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}
