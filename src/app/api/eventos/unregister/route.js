// app/api/eventos/unregister/route.js
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { recalcularCupos } from '@/lib/eventos-cupos';
import { sqlEventoTerminado } from '@/lib/eventos-fechas';

export async function POST(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = Number(auth.session.id);

  let client;

  try {
    const data = await request.json();
    const { eventoId } = data;

    // Validaciones básicas: solo eventoId proviene del body. La identidad y el "tipo"
    // (siempre miembro, porque solo los miembros tienen JWT) se derivan del token.
    if (!eventoId || isNaN(Number(eventoId))) {
      return NextResponse.json({ success: false, error: 'Datos de evento no válidos' }, { status: 400 });
    }

    try {
      client = await connectWithRetry();
    } catch (connectionError) {
      console.error('Error de conexión en /api/eventos/unregister:', connectionError);
      return NextResponse.json(
        { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }

    try {
        await client.query('BEGIN');

        // Bloquear el evento durante toda la transacción: el recálculo de cupos
        // del final tiene que ser atómico frente a registros simultáneos.
        const eventoRes = await client.query(
          `SELECT id_evento, ${sqlEventoTerminado('evento')} AS evento_terminado
             FROM evento WHERE id_evento = $1 AND deleted_at IS NULL FOR UPDATE`,
          [eventoId],
        );
        if (eventoRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return NextResponse.json({ success: false, error: 'Evento no encontrado' }, { status: 404 });
        }

        // Cancelar DESPUÉS del evento borraba a la persona de los reportes de
        // asistencia (todos filtran estado <> 'cancelada') aunque su `asistio`
        // siguiera en true, y encima devolvía un cupo a un evento ya celebrado.
        if (eventoRes.rows[0].evento_terminado) {
          await client.query('ROLLBACK');
          return NextResponse.json({
            success: false,
            error: 'Este evento ya finalizó; no se puede cancelar la inscripción.',
          }, { status: 400 });
        }

        // 1. Inscripción directa (individual) del miembro autenticado.
        //    Cancelación lógica (estado='cancelada'), no borrado físico, para
        //    preservar historial. Solo cancela si NO estaba ya cancelada y si
        //    aún no se registró su asistencia.
        let res = await client.query(
          `UPDATE inscripcion_evento
              SET estado = 'cancelada', updated_at = NOW()
            WHERE id_evento = $1 AND id_miembro = $2 AND estado <> 'cancelada' AND asistio = false
            RETURNING id_inscripcion, id_equipo`,
          [eventoId, userId],
        );

        // Si no se canceló nada, distinguir "ya te registraron la asistencia"
        // del 404 genérico: son motivos muy distintos para el usuario.
        if (res.rowCount === 0) {
          const asistioRes = await client.query(
            `SELECT 1 FROM inscripcion_evento
              WHERE id_evento = $1 AND id_miembro = $2 AND estado <> 'cancelada' AND asistio = true
              LIMIT 1`,
            [eventoId, userId],
          );
          if (asistioRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({
              success: false,
              error: 'Tu asistencia a este evento ya fue registrada; no se puede cancelar la inscripción.',
            }, { status: 400 });
          }
        }

        // 2. Si no había inscripción directa, ver si pertenece a un equipo inscrito.
        if (res.rowCount === 0) {
             const teamRes = await client.query(`
                SELECT ie.id_inscripcion, ie.id_equipo, ie.asistio, int_eq.es_capitan
                FROM inscripcion_evento ie
                JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
                JOIN integrante_equipo int_eq ON eq.id_equipo = int_eq.id_equipo
                WHERE ie.id_evento = $1 AND int_eq.id_miembro = $2 AND ie.estado <> 'cancelada'
                LIMIT 1
             `, [eventoId, userId]);

             if (teamRes.rows.length > 0) {
                 const row = teamRes.rows[0];
                 // Solo el capitán puede cancelar la inscripción del equipo completo
                 // (afecta a todos los integrantes).
                 if (!row.es_capitan) {
                     await client.query('ROLLBACK');
                     return NextResponse.json({
                         success: false,
                         error: 'Solo el capitán del equipo puede cancelar la inscripción del equipo.',
                     }, { status: 403 });
                 }
                 if (row.asistio) {
                     await client.query('ROLLBACK');
                     return NextResponse.json({
                         success: false,
                         error: 'La asistencia del equipo ya fue registrada; no se puede cancelar la inscripción.',
                     }, { status: 400 });
                 }
                 await client.query(
                   `UPDATE inscripcion_evento SET estado = 'cancelada', updated_at = NOW() WHERE id_inscripcion = $1`,
                   [row.id_inscripcion],
                 );
                 res = { rowCount: 1 };
             }
        }

        if (res.rowCount > 0) {
            // Contabilidad de cupos en un único punto: se derivan de las
            // inscripciones reales en vez de sumar/restar a mano (el equipo
            // liberaba N-1 aquí y 1 en el trigger, con reglas distintas).
            // Ver src/lib/eventos-cupos.js.
            const cuposFinales = await recalcularCupos(client, eventoId);

            const updatedEventRes = await client.query(`
                SELECT
                id_evento, nombre as nombre_evento, fecha_inicio as fecha, hora_inicio, cupos, cupos_disponibles,
                (SELECT COUNT(*) FROM inscripcion_evento WHERE id_evento = $1 AND estado <> 'cancelada') as asistentes_count
                FROM evento WHERE id_evento = $1
            `, [eventoId]);
            const updatedEvent = updatedEventRes.rows[0];

            await client.query('COMMIT');

            return NextResponse.json({
                success: true,
                message: 'Inscripción cancelada correctamente',
                event: {
                    ...updatedEvent,
                    fecha: updatedEvent?.fecha instanceof Date ? updatedEvent.fecha.toISOString().split('T')[0] : updatedEvent?.fecha,
                    asistentes_count: Number(updatedEvent?.asistentes_count) || 0,
                    cupos_disponibles: updatedEvent?.cupos_disponibles !== null ? Number(updatedEvent.cupos_disponibles) : null,
                    lugares_ocupados: cuposFinales.lugares_ocupados
                }
            });
        } else {
            await client.query('ROLLBACK');
            return NextResponse.json({ success: false, error: 'No se encontró una inscripción activa para cancelar' }, { status: 404 });
        }

    } catch (error) {
        if (client) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            console.error('Error en ROLLBACK:', rollbackError);
          }
        }
        console.error('Error en unregister:', error);

        // Manejo específico de errores de conexión
        if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
          return NextResponse.json(
            { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
            { status: 503 }
          );
        }

        return NextResponse.json({ success: false, error: 'Error al cancelar la inscripción' }, { status: 500 });
    } finally {
        if (client) client.release();
    }
  } catch (error) {
    console.error('Error en request:', error);
    return NextResponse.json(
      { success: false, error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}
