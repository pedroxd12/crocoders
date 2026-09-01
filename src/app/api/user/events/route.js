import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { ZONA_EVENTOS } from '@/lib/eventos-fechas';

// "Hoy" para un evento es hoy EN MÉXICO, no en el servidor. `CURRENT_DATE` es
// la fecha del proceso, que en Vercel corre en UTC: a partir de las 18:00 hora
// local ya es el día siguiente en UTC, así que un evento que termina hoy a las
// 21:00 se marcaba como finalizado ("No asistió") mientras aún se estaba
// celebrando, y desaparecía de la lista de quien no se había inscrito todavía.
// Es la misma convención que documenta src/lib/eventos-fechas.js.
const HOY = `((NOW() AT TIME ZONE '${ZONA_EVENTOS}')::date)`;

/**
 * Eventos del usuario para la pestaña "Mis eventos" del perfil.
 *
 * Antes esta consulta no tenía WHERE: devolvía TODOS los eventos de la base
 * (incluidos los borrados con deleted_at, los que siguen en 'planificacion' y
 * los ocultos con listable=false) y resumía todo en un booleano `participacion`
 * que sólo significaba "existe una fila en inscripcion_evento". De ahí salían
 * los dos errores visibles: un evento del mes que viene se marcaba "No
 * participó" en rojo, y quien se inscribió pero nunca fue seguía apareciendo
 * como participante.
 *
 * Ahora se devuelven las señales por separado —inscrito, asistió, estado de la
 * inscripción y situación temporal del evento— y es la UI la que compone el
 * estado (Próximo / Inscrito / Asistió / No asistió / Cancelada). El cálculo de
 * "ya pasó" se hace en Postgres, contra el día en México (ver HOY arriba), para
 * no depender ni de la zona del navegador ni de la del servidor.
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = Number(auth.session.id);

  let client;
  try {
    client = await connectWithRetry();

    const result = await client.query(
      `SELECT
          e.id_evento,
          e.nombre,
          -- Las columnas son \`date\`: se serializan como texto plano para que el
          -- cliente no las reinterprete en UTC y muestre el día anterior.
          to_char(e.fecha_inicio, 'YYYY-MM-DD') AS fecha,
          to_char(e.fecha_fin,    'YYYY-MM-DD') AS fecha_fin,
          t.nombre AS tipo,
          e.estado AS estado_evento,
          e.ubicacion,
          (i.id_inscripcion IS NOT NULL AND i.estado <> 'cancelada') AS inscrito,
          COALESCE(i.asistio, false) AS asistio,
          i.estado AS estado_inscripcion,
          (e.fecha_fin < ${HOY}) AS finalizado,
          (${HOY} BETWEEN e.fecha_inicio AND e.fecha_fin) AS en_curso
        FROM evento e
        JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
        -- LATERAL en vez de LEFT JOIN directo: garantiza UNA fila por evento
        -- (un miembro puede aparecer inscrito a título individual y además
        -- dentro de un equipo) y permite priorizar la inscripción vigente.
        LEFT JOIN LATERAL (
          SELECT ie.id_inscripcion, ie.asistio, ie.estado
            FROM inscripcion_evento ie
           WHERE ie.id_evento = e.id_evento
             AND (
               ie.id_miembro = $1
               OR EXISTS (
                 SELECT 1
                   FROM integrante_equipo iq
                  WHERE iq.id_equipo = ie.id_equipo
                    AND iq.id_miembro = $1
               )
             )
           ORDER BY (ie.estado = 'cancelada'), ie.asistio DESC, ie.id_inscripcion
           LIMIT 1
        ) i ON TRUE
       WHERE e.deleted_at IS NULL
         AND e.estado IN ('publicado', 'en_curso', 'finalizado', 'cancelado')
         -- Los eventos en los que no participa sólo se muestran si aún se puede
         -- asistir a ellos; el historial no se llena de eventos ajenos ya pasados.
         AND (
           i.id_inscripcion IS NOT NULL
           OR (
             e.estado IN ('publicado', 'en_curso')
             AND e.listable = TRUE
             AND e.fecha_fin >= ${HOY}
           )
         )
       ORDER BY e.fecha_inicio DESC`,
      [userId],
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error al obtener eventos del usuario:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener los eventos' },
      { status: 500 },
    );
  } finally {
    if (client) client.release();
  }
}
