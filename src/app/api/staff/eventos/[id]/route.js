import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { sqlLugaresOcupados } from '@/lib/eventos-cupos';

// GET - Detalle de un evento para el panel de staff.
// Gate: autenticado; abajo se exige pertenencia a staff_evento de ESTE evento (403).
//
// Devuelve el evento con los MISMOS datos generales que ve un administrador
// (tipo, modalidad y tamaño de equipo, alcance, aforo en lugares, costo, talla,
// cierre de inscripciones, desafíos) y `mi_rol` con las banderas del catálogo:
// con ellas la pantalla decide qué acciones ofrecer (src/lib/roles-staff.js).
export async function GET(request, { params }) {
  const guard = await requireAuth(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    const id_miembro = guard.session.id;

    const staffCheck = await client.query(
      `SELECT r.nombre as rol, r.id_rol, r.puede_administrar, r.puede_editar, r.puede_ver
         FROM staff_evento se
         JOIN catalogo_rol_staff r ON se.id_rol = r.id_rol
        WHERE se.id_evento = $1 AND se.id_miembro = $2`,
      [id, id_miembro],
    );
    if (staffCheck.rows.length === 0) {
      return NextResponse.json({ error: 'No tienes permisos para este evento' }, { status: 403 });
    }

    const eventoResult = await client.query(
      // Alias iguales a los del endpoint de lista (`descripcion`, `imagen_url`,
      // `tipo_evento`, `alcance`) y, además, los nombres que usa el detalle de
      // admin (`tipo_nombre`, `alcance_nombre`) para compartir la ficha del
      // evento entre los dos paneles.
      //
      // fecha_inicio/fecha_fin son `date`: se devuelven como texto para que el
      // cliente no las reinterprete en UTC. Las horas (`time`) llegan del
      // driver ya como texto. `fecha_limite_registro` es hora de pared de
      // México sin zona: se entrega tal cual, como hace el panel de admin.
      `SELECT
        e.id_evento,
        e.nombre,
        e.descripcion_html AS descripcion,
        to_char(e.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
        to_char(e.fecha_fin,    'YYYY-MM-DD') AS fecha_fin,
        e.hora_inicio,
        e.hora_fin,
        e.ubicacion,
        e.cupos,
        e.cupos_disponibles,
        e.estado,
        e.tiene_costo,
        e.costo,
        e.solicitar_talla,
        TO_CHAR(e.fecha_limite_registro, 'YYYY-MM-DD"T"HH24:MI') AS fecha_limite_registro,
        e.imagen_flyer_url AS imagen_url,
        te.nombre AS tipo_evento,
        te.nombre AS tipo_nombre,
        te.permite_equipos,
        ae.nombre AS alcance,
        ae.nombre AS alcance_nombre,
        c.id_concurso,
        c.modalidad,
        c.min_integrantes_equipo,
        c.max_integrantes_equipo,
        c.requiere_asesor,
        c.asesor_participa,
        c.max_asesores,
        (SELECT COUNT(*)::int FROM reto_evento r WHERE r.id_evento = e.id_evento) AS total_retos,
        (SELECT COUNT(*)::int FROM inscripcion_evento ie
          WHERE ie.id_evento = e.id_evento AND ie.estado <> 'cancelada') AS total_inscritos,
        (SELECT COUNT(*)::int FROM inscripcion_evento ie
          WHERE ie.id_evento = e.id_evento AND ie.estado <> 'cancelada' AND ie.asistio) AS total_asistieron,
        (SELECT COUNT(*)::int FROM inscripcion_evento ie
          WHERE ie.id_evento = e.id_evento AND ie.estado <> 'cancelada' AND ie.pago_completado) AS pagos_completados,
        ${sqlLugaresOcupados('e')} AS lugares_ocupados
      FROM evento e
      LEFT JOIN catalogo_tipo_evento te ON e.id_tipo_evento = te.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento ae ON e.id_alcance = ae.id_alcance
      LEFT JOIN concurso c ON c.id_evento = e.id_evento
      WHERE e.id_evento = $1 AND e.deleted_at IS NULL`,
      [id],
    );

    if (eventoResult.rows.length === 0) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      evento: eventoResult.rows[0],
      mi_rol: staffCheck.rows[0],
    });
  } catch (error) {
    console.error('Error fetching evento details:', error);
    return NextResponse.json({ error: 'Error al obtener detalles del evento' }, { status: 500 });
  } finally {
    client.release();
  }
}
