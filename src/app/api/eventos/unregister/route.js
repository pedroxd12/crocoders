// app/api/eventos/unregister/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';

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
      client = await pool.connect();
    } catch (connectionError) {
      console.error('💥 Error de conexión en /api/eventos/unregister:', connectionError);
      return NextResponse.json(
        { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }
    
    try {
        await client.query('BEGIN');
        
        // 1. Verificar si hay inscripción directa (individual) del miembro autenticado
        let res = await client.query(
          'DELETE FROM inscripcion_evento WHERE id_evento = $1 AND id_miembro = $2 RETURNING id_inscripcion, id_equipo',
          [eventoId, userId],
        );
        let idEquipoToDelete = null;

        // 2. Si no se borró nada, verificar si pertenece a un equipo (Inscripción indirecta)
        if (res.rowCount === 0) {
             // Buscar el equipo al que pertenece el usuario en este evento
             const teamRes = await client.query(`
                SELECT ie.id_inscripcion, ie.id_equipo 
                FROM inscripcion_evento ie
                JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
                JOIN integrante_equipo int_eq ON eq.id_equipo = int_eq.id_equipo
                WHERE ie.id_evento = $1 AND int_eq.id_miembro = $2
                LIMIT 1
             `, [eventoId, userId]);

             if (teamRes.rows.length > 0) {
                 // Encontrado! Es parte de un equipo.
                 // IMPORTANTE: Al "desinscribirse", ¿borramos todo el equipo o solo al miembro?
                 // Generalmente el usuario espera salir del evento. Si es capitan o último miembro, se borra el equipo.
                 // Por simplicidad en este flujo, borraremos la inscripción del equipo completo (cancelación de equipo).
                 // Ojo: Esto afecta a otros miembros. Deberíamos advertir en frontend, pero asumiremos cancelación total por ahora.
                 
                 const row = teamRes.rows[0];
                 await client.query('DELETE FROM inscripcion_evento WHERE id_inscripcion = $1', [row.id_inscripcion]);
                 idEquipoToDelete = row.id_equipo;
                 res = { rowCount: 1 }; // Marcar como borrado
             }
        }

        if (res.rowCount > 0) {
            await client.query(
              `UPDATE evento
                  SET cupos_disponibles = LEAST(cupos, cupos_disponibles + 1)
                WHERE id_evento = $1`,
              [eventoId],
            );

            if (idEquipoToDelete) {
              await client.query('DELETE FROM equipo_concurso WHERE id_equipo = $1', [idEquipoToDelete]);
            }

            await client.query('COMMIT');
            
            // Obtener datos actualizados para el cliente
            const updatedEventRes = await client.query(`
                SELECT 
                id_evento, nombre as nombre_evento, fecha_inicio as fecha, hora_inicio, cupos_disponibles,
                (SELECT COUNT(*) FROM inscripcion_evento WHERE id_evento = $1) as asistentes_count
                FROM evento WHERE id_evento = $1
            `, [eventoId]);
            const updatedEvent = updatedEventRes.rows[0];

            return NextResponse.json({ 
                success: true, 
                message: 'Inscripción cancelada correctamente',
                event: {
                    ...updatedEvent,
                    fecha: updatedEvent?.fecha instanceof Date ? updatedEvent.fecha.toISOString().split('T')[0] : updatedEvent?.fecha,
                    asistentes_count: Number(updatedEvent?.asistentes_count) || 0,
                    cupos_disponibles: updatedEvent?.cupos_disponibles !== null ? Number(updatedEvent.cupos_disponibles) : null
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
            console.error('⚠️ Error en ROLLBACK:', rollbackError);
          }
        }
        console.error('💥 Error en unregister:', error);
        
        // Manejo específico de errores de conexión
        if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
          return NextResponse.json(
            { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
            { status: 503 }
          );
        }
        
        return NextResponse.json({ success: false, error: 'Error al cancelar la inscripción: ' + error.message }, { status: 500 });
    } finally {
        if (client) client.release();
    }
  } catch (error) {
    console.error('💥 Error en request:', error);
    return NextResponse.json(
      { success: false, error: 'Error al procesar la solicitud: ' + error.message },
      { status: 500 }
    );
  }
}