import { NextResponse } from 'next/server';
import { query } from '@/lib/db-server';
import { ZONA_EVENTOS, sqlLimiteRegistro, sqlRegistroCerrado, sqlEventoTerminado } from '@/lib/eventos-fechas';

export async function GET(request, context) {
  try {
    const { id } = await context.params; // Next 16: params es asincrono

    if (!id || isNaN(Number(id))) {
      return NextResponse.json(
        { error: 'ID de evento es requerido y debe ser un número válido' },
        { status: 400 }
      );
    }

    // Se usa `query()` en vez del template `sql` porque las expresiones de zona
    // horaria son SQL, no parámetros: el template las convertiría en $N.
    //
    // Proyección explícita en vez de `e.*`: la ficha es pública y no debe
    // filtrar columnas internas (imagen_flyer_key, listable, deleted_at,
    // created_at/updated_at).
    //
    // `fecha_limite_registro` sale como instante REAL (timestamptz) y no como el
    // timestamp naive de la columna: lo guardado es hora de pared de México y,
    // sin la conversión, el cliente lo leía como UTC y anunciaba el cierre seis
    // horas antes del real. Ver src/lib/eventos-fechas.js.
    //
    // `lugares_ocupados` cuenta LUGARES (un equipo ocupa uno por integrante);
    // `asistentes_count` cuenta FILAS de inscripción. Son unidades distintas y
    // por eso se exponen por separado: mezclarlas es lo que producía cosas como
    // "147/150 disponibles" con un solo inscrito.
    const sqlTexto = `
      SELECT
        e.id_evento,
        e.nombre,
        e.descripcion_html,
        e.id_tipo_evento,
        e.id_alcance,
        e.fecha_inicio,
        e.hora_inicio,
        e.fecha_fin,
        e.hora_fin,
        e.ubicacion,
        e.cupos,
        e.cupos_disponibles,
        e.tiene_costo,
        e.costo,
        e.imagen_flyer_url,
        e.estado,
        (e.fecha_limite_registro AT TIME ZONE '${ZONA_EVENTOS}') AS fecha_limite_registro,
        -- Cierre efectivo: la fecha límite, o 1 hora antes del inicio si no hay.
        ${sqlLimiteRegistro('e')} AS limite_registro_efectivo,
        ${sqlRegistroCerrado('e')} AS registro_cerrado,
        ${sqlEventoTerminado('e')} AS evento_terminado,
        t.nombre as tipo_nombre,
        t.permite_equipos,
        a.nombre as alcance_nombre,
        c.id_concurso,
        c.modalidad,
        c.max_integrantes_equipo,
        c.min_integrantes_equipo,
        c.requiere_asesor,
        c.url_concurso,
        (
          SELECT COUNT(*)
          FROM inscripcion_evento
          WHERE id_evento = e.id_evento AND estado <> 'cancelada'
        ) as asistentes_count,
        (
          SELECT COALESCE(SUM(
                   CASE WHEN ie.id_equipo IS NOT NULL
                        THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = ie.id_equipo)
                        ELSE 1 END
                 ), 0)::int
          FROM inscripcion_evento ie
          WHERE ie.id_evento = e.id_evento AND ie.estado <> 'cancelada'
        ) as lugares_ocupados
      FROM evento e
      LEFT JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento a ON e.id_alcance = a.id_alcance
      LEFT JOIN concurso c ON e.id_evento = c.id_evento
      WHERE e.id_evento = $1
        AND e.deleted_at IS NULL
        AND e.listable = TRUE
        -- Los borradores ('planificacion') y los cancelados no son públicos:
        -- antes se podían leer enteros enumerando ids, aunque no salieran en el
        -- listado. 'finalizado' sí se sirve para poder consultar eventos pasados.
        AND e.estado IN ('publicado', 'en_curso', 'finalizado')
    `;

    const resultado = await query(sqlTexto, [id]);
    const evento = resultado.rows.length > 0 ? resultado.rows[0] : null;

    if (!evento) {
      return NextResponse.json(
        { error: 'Evento no encontrado' },
        { status: 404 }
      );
    }

    const eventoFormateado = {
      ...evento,
      // Mapeo para retrocompatibilidad con frontend que espera 'fecha'
      fecha: evento.fecha_inicio instanceof Date ? evento.fecha_inicio.toISOString().split('T')[0] : evento.fecha_inicio,
      fecha_inicio: evento.fecha_inicio instanceof Date ? evento.fecha_inicio.toISOString().split('T')[0] : evento.fecha_inicio,
      fecha_fin: evento.fecha_fin instanceof Date ? evento.fecha_fin.toISOString().split('T')[0] : evento.fecha_fin,
      // Ya vienen como instantes reales desde SQL: toISOString() da el momento
      // correcto y el navegador lo pinta en la hora local del visitante.
      fecha_limite_registro: evento.fecha_limite_registro instanceof Date
        ? evento.fecha_limite_registro.toISOString()
        : evento.fecha_limite_registro,
      limite_registro_efectivo: evento.limite_registro_efectivo instanceof Date
        ? evento.limite_registro_efectivo.toISOString()
        : evento.limite_registro_efectivo,
      // El servidor ya decidió si el registro está cerrado y si el evento
      // terminó: la UI no tiene que recalcularlo (y equivocarse) por su cuenta.
      registro_cerrado: Boolean(evento.registro_cerrado),
      evento_terminado: Boolean(evento.evento_terminado),
      hora_inicio: evento.hora_inicio?.toString?.() ?? null,
      hora_fin: evento.hora_fin?.toString?.() ?? null,
      tipo: evento.tipo_nombre || 'Evento',
      tipo_evento: evento.tipo_nombre || 'Evento',
      hermandad: evento.alcance_nombre || 'Club',
      costo: evento.costo !== null ? Number(evento.costo) : null,
      // Mapeo de descripción
      descripcion: evento.descripcion_html,
      // Alias si el frontend lo usa
      nombre_evento: evento.nombre,
      titulo: evento.nombre,
      cupos: evento.cupos !== null ? Number(evento.cupos) : null,
      // Usar columna directa de cupos_disponibles
      cupos_disponibles: evento.cupos_disponibles !== null ? Number(evento.cupos_disponibles) : null,
      lugares_ocupados: Number(evento.lugares_ocupados) || 0,
      asistentes_count: Number(evento.asistentes_count) || 0,
      total_inscritos: Number(evento.asistentes_count) || 0,
      imagen_url: evento.imagen_flyer_url, // Alias si el front usa imagen_url
      url_concurso: evento.url_concurso
    };

    return NextResponse.json(eventoFormateado);
  } catch (error) {
    console.error('Error en GET /api/eventos/[id]:', error);
    return NextResponse.json(
      { error: 'Error al obtener evento' },
      { status: 500 },
    );
  }
}

