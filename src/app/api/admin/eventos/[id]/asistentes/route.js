import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { SQL_COLUMNAS_COMPROBANTE, SQL_JOIN_COMPROBANTE } from '@/lib/comprobantes-pago';

export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  let client;
  try {
    client = await connectWithRetry();
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
            -- Para un equipo, el contacto es el CAPITÁN (es a quien se le manda
            -- el correo de confirmación). Antes se usaba el correo del asesor,
            -- que es opcional y casi nunca se rellena: la columna salía vacía y
            -- el admin no tenía forma de contactar al equipo. Se resuelve con
            -- una subconsulta escalar y no con JOIN para que un dato antiguo con
            -- dos capitanes no duplique la fila del listado.
            WHEN eq.id_equipo IS NOT NULL THEN COALESCE(
                (SELECT COALESCE(cm.correo_electronico, ci.correo_electronico)
                   FROM integrante_equipo cap
                   LEFT JOIN miembro cm ON cm.id_miembro = cap.id_miembro
                   LEFT JOIN invitado ci ON ci.id_invitado = cap.id_invitado
                  WHERE cap.id_equipo = eq.id_equipo AND cap.es_capitan = true
                  LIMIT 1),
                eq.correo_asesor)
        END as correo,
        CASE
            WHEN m.id_miembro IS NOT NULL THEN 'Miembro'
            WHEN i.id_invitado IS NOT NULL THEN 'Invitado'
            WHEN eq.id_equipo IS NOT NULL THEN 'Equipo'
        END as tipo_usuario,
        CASE WHEN eq.id_equipo IS NOT NULL
             THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = eq.id_equipo)
             ELSE NULL END as integrantes_equipo,
        -- Check-in por persona (migración 009): cuántos integrantes ya llegaron
        -- y cuántas playeras se entregaron (integrantes + asesores). En filas
        -- individuales la entrega viaja en playera_entregada de la inscripción.
        ie.playera_entregada,
        CASE WHEN eq.id_equipo IS NOT NULL
             THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = eq.id_equipo AND asistio)
             ELSE NULL END as integrantes_asistieron,
        CASE WHEN eq.id_equipo IS NOT NULL
             THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = eq.id_equipo AND playera_entregada)
                + (SELECT COUNT(*) FROM asesor_equipo WHERE id_equipo = eq.id_equipo AND playera_entregada)
             ELSE NULL END as playeras_entregadas,
        CASE WHEN eq.id_equipo IS NOT NULL
             THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = eq.id_equipo)
                + (SELECT COUNT(*) FROM asesor_equipo WHERE id_equipo = eq.id_equipo)
             ELSE NULL END as personas_equipo,
        m.numero_ieee,
        -- Datos de referencia del inscrito (los pide el formulario público).
        i.nivel_estudios,
        i.edad,
        -- Talla: la del miembro/invitado, o las de todo el equipo agregadas
        -- (una por integrante, en orden de alta) para poder pedir las playeras.
        CASE
            WHEN m.id_miembro IS NOT NULL THEN m.talla_playera
            WHEN i.id_invitado IS NOT NULL THEN i.talla_playera
            WHEN eq.id_equipo IS NOT NULL THEN (
                SELECT string_agg(COALESCE(tm.talla_playera, ti.talla_playera, '—'), ', ' ORDER BY it.id_integrante)
                  FROM integrante_equipo it
                  LEFT JOIN miembro tm ON tm.id_miembro = it.id_miembro
                  LEFT JOIN invitado ti ON ti.id_invitado = it.id_invitado
                 WHERE it.id_equipo = eq.id_equipo)
        END as talla_playera,
        e.nombre as nombre_evento,
        e.fecha_inicio,
        -- Comprobante de pago subido por el inscrito (migración 013): es lo
        -- que se valida desde esta misma pantalla.
        ${SQL_COLUMNAS_COMPROBANTE}
      FROM inscripcion_evento ie
      LEFT JOIN miembro m ON ie.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ie.id_invitado = i.id_invitado
      LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
      JOIN evento e ON ie.id_evento = e.id_evento${SQL_JOIN_COMPROBANTE}
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
