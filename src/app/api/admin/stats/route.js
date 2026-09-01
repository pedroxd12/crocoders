import { NextResponse } from 'next/server';
import { query } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

// Todas las consultas del dashboard son independientes entre sí. Antes se
// encadenaban con `await` sobre un mismo client, así que el tiempo de respuesta
// era la SUMA de las cinco; ahora es el de la más lenta. `query()` toma cada
// conexión del pool (nunca `pool.query()` directo: la memoria del proyecto lo
// prohíbe por los ECONNRESET de Railway).
export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const [
      membersRes,
      eventsRes,
      financeRes,
      inscripciones30Res,
      recentRes,
      eventStatsRes,
    ] = await Promise.all([
      // 1. Miembros activos
      query("SELECT COUNT(*)::int AS count FROM miembro WHERE estado = 'activo' AND deleted_at IS NULL"),

      // 2. Eventos PUBLICADOS. Ojo: no son "realizados" — todo evento nace
      // publicado y aquí entran también los que aún no han ocurrido. El nombre
      // del campo dice lo que realmente cuenta.
      query("SELECT COUNT(*)::int AS count FROM evento WHERE deleted_at IS NULL AND estado = 'publicado'"),

      // 3. Recaudación. Una inscripción de EQUIPO cubre a N integrantes, así
      // que sumar `e.costo` una vez por inscripción subestimaba el ingreso de
      // todos los eventos por equipos. Se pondera por número de integrantes,
      // igual que hace el recálculo de cupos.
      query(`
        SELECT COALESCE(SUM(
                 e.costo * CASE
                   WHEN ie.id_equipo IS NOT NULL
                     THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = ie.id_equipo)
                   ELSE 1
                 END
               ), 0)::float AS total
          FROM inscripcion_evento ie
          JOIN evento e ON ie.id_evento = e.id_evento
         WHERE ie.pago_completado = true
           AND ie.estado <> 'cancelada'
           AND e.deleted_at IS NULL
      `),

      // 4. Inscripciones de los últimos 30 días. La tarjeta mostraba
      // `recentInscriptions.length`, es decir el LIMIT 5 de la consulta de
      // abajo: en cuanto había 5 inscripciones históricas el KPI decía "5" para
      // siempre. Esto sí cuenta actividad real.
      query(`
        SELECT COUNT(*)::int AS count
          FROM inscripcion_evento ie
          JOIN evento e ON ie.id_evento = e.id_evento
         WHERE ie.estado <> 'cancelada'
           AND e.deleted_at IS NULL
           AND ie.fecha_inscripcion >= NOW() - INTERVAL '30 days'
      `),

      // 5. Últimas 5 inscripciones (la lista, no el KPI)
      query(`
        SELECT
          ie.id_inscripcion,
          ie.fecha_inscripcion,
          e.nombre AS evento,
          -- Una inscripcion apunta a UN miembro, UN invitado o UN EQUIPO. El
          -- tercer caso faltaba, asi que toda inscripcion por equipos se
          -- mostraba como "Sin nombre" en el panel.
          COALESCE(
            m.nombre || ' ' || m.apellido_paterno,
            i.nombre_completo,
            eq.nombre_equipo
          ) AS usuario,
          CASE
            WHEN ie.id_equipo IS NOT NULL THEN 'equipo'
            WHEN ie.id_invitado IS NOT NULL THEN 'invitado'
            ELSE 'miembro'
          END AS tipo_participante,
          ie.estado
        FROM inscripcion_evento ie
        JOIN evento e ON ie.id_evento = e.id_evento
        LEFT JOIN miembro m ON ie.id_miembro = m.id_miembro
        LEFT JOIN invitado i ON ie.id_invitado = i.id_invitado
        LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
        WHERE e.deleted_at IS NULL
        ORDER BY ie.fecha_inscripcion DESC
        LIMIT 5
      `),

      // 6. Resumen de los 5 eventos más recientes
      query(`
        SELECT
          e.id_evento,
          e.nombre,
          e.fecha_inicio,
          COUNT(ie.id_inscripcion)::int AS registrados,
          COUNT(CASE WHEN ie.asistio THEN 1 END)::int AS asistentes
        FROM evento e
        LEFT JOIN inscripcion_evento ie ON e.id_evento = ie.id_evento AND ie.estado <> 'cancelada'
        WHERE e.deleted_at IS NULL
        GROUP BY e.id_evento
        ORDER BY e.fecha_inicio DESC
        LIMIT 5
      `),
    ]);

    return NextResponse.json({
      activeMembers: membersRes.rows[0].count,
      eventosPublicados: eventsRes.rows[0].count,
      totalRevenue: financeRes.rows[0].total ?? 0,
      inscripcionesUltimos30: inscripciones30Res.rows[0].count,
      recentInscriptions: recentRes.rows,
      eventStats: eventStatsRes.rows,
    });
  } catch (error) {
    console.error('Stats Error:', error);
    return NextResponse.json({ error: 'Error al obtener las estadísticas' }, { status: 500 });
  }
}
