import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';

// GET - Obtener detalles de un evento como staff.
// Gate: autenticado; abajo se exige pertenencia a staff_evento de ESTE evento (403).
export async function GET(request, { params }) {
  const guard = await requireAuth(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const client = await connectWithRetry();

  try {
    const id_miembro = guard.session.id;

    // Verificar que el usuario es staff del evento
    const staffCheck = await client.query(
      `SELECT r.nombre as rol, r.id_rol, r.puede_administrar, r.puede_editar, r.puede_ver
       FROM staff_evento se
       JOIN catalogo_rol_staff r ON se.id_rol = r.id_rol
       WHERE se.id_evento = $1 AND se.id_miembro = $2`,
      [id, id_miembro]
    );

    if (staffCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'No tienes permisos para este evento' },
        { status: 403 }
      );
    }

    // Obtener detalles del evento
    const eventoResult = await client.query(
      // Columnas explícitas con los MISMOS alias que el endpoint de lista.
      // Con `e.*` los campos llegaban como `descripcion_html` e
      // `imagen_flyer_url`, pero la vista leía `descripcion` e `imagen_url`:
      // el flyer no se pintaba nunca y bajo el título quedaba un párrafo vacío.
      `SELECT
        e.id_evento,
        e.nombre,
        e.descripcion_html AS descripcion,
        to_char(e.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
        to_char(e.fecha_fin,    'YYYY-MM-DD') AS fecha_fin,
        -- El tipo time llega del driver ya como texto ("18:00:00"); el recorte
        -- a "18:00" lo hace formatearHora() en la vista. Ver el comentario
        -- equivalente en el endpoint de lista.
        e.hora_inicio,
        e.hora_fin,
        e.ubicacion,
        e.cupos,
        e.cupos_disponibles,
        e.estado,
        e.tiene_costo,
        e.costo,
        e.imagen_flyer_url AS imagen_url,
        te.nombre as tipo_evento,
        ae.nombre as alcance,
        COUNT(DISTINCT ie.id_inscripcion) as total_inscritos,
        COUNT(DISTINCT CASE WHEN ie.asistio = true THEN ie.id_inscripcion END) as total_asistieron,
        COUNT(DISTINCT CASE WHEN ie.pago_completado = true THEN ie.id_inscripcion END) as pagos_completados
      FROM evento e
      LEFT JOIN catalogo_tipo_evento te ON e.id_tipo_evento = te.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento ae ON e.id_alcance = ae.id_alcance
      LEFT JOIN inscripcion_evento ie ON e.id_evento = ie.id_evento AND ie.estado <> 'cancelada'
      WHERE e.id_evento = $1 AND e.deleted_at IS NULL
      GROUP BY e.id_evento, te.nombre, ae.nombre`,
      [id]
    );

    if (eventoResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Evento no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      evento: eventoResult.rows[0],
      mi_rol: staffCheck.rows[0]
    });
  } catch (error) {
    console.error('Error fetching evento details:', error);
    return NextResponse.json(
      { error: 'Error al obtener detalles del evento' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
