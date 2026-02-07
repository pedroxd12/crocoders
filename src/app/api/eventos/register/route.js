import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

export async function POST(request) {
  const client = await pool.connect();
  try {
    const data = await request.json();
    const { eventoId, userId, tipo, equipo, integrantes, asesor } = data;
    
    if (!eventoId) {
      return NextResponse.json({ success: false, error: 'ID de evento no válido' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Obtener información del evento y si es concurso (equipos)
    const eventoRes = await client.query(`
      SELECT e.id_evento, e.cupos_disponibles, e.estado, e.nombre, e.fecha_limite_registro,
             c.id_concurso, c.max_integrantes_equipo, c.requiere_asesor, t.permite_equipos
      FROM evento e
      LEFT JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
      LEFT JOIN concurso c ON e.id_evento = c.id_evento
      WHERE e.id_evento = $1 FOR UPDATE OF e
    `, [eventoId]);
    
    if (eventoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Evento no encontrado' }, { status: 404 });
    }
    
    const evento = eventoRes.rows[0];

    // Verificar fecha límite de registro
    if (evento.fecha_limite_registro) {
      const now = new Date();
      const fechaLimite = new Date(evento.fecha_limite_registro);
      if (now > fechaLimite) {
        await client.query('ROLLBACK');
        return NextResponse.json({ 
          success: false, 
          error: 'El periodo de inscripción para este evento ha finalizado.' 
        }, { status: 400 });
      }
    }

    // Verificar estado
    if (!['publicado', 'en_curso'].includes(evento.estado)) {
        await client.query('ROLLBACK');
        return NextResponse.json({ success: false, error: 'El evento no está disponible para registros.' }, { status: 400 });
    }
    
    // Verificar cupos (General)
    if (evento.cupos_disponibles <= 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'No hay cupos disponibles para este evento' }, { status: 400 });
    }

    // --- VERIFICACIÓN ROBUSTA DE DUPLICADOS ---
    // Verifica si el usuario ya tiene inscripción directa O es parte de un equipo en este evento
    if (userId) {
        // Asumimos que si tipo == 'equipo', el creador es un miembro (un invitado no suele crear equipos)
        // Si tipo == 'invitado', buscamos en id_invitado. En otros casos (miembro, equipo), id_miembro.
        const userCol = (tipo === 'invitado') ? 'id_invitado' : 'id_miembro';
        
        const dupCheck = await client.query(`
            SELECT 1 
            FROM inscripcion_evento ie
            LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
            LEFT JOIN integrante_equipo int_eq ON eq.id_equipo = int_eq.id_equipo
            WHERE ie.id_evento = $1
            AND (
                ie.${userCol} = $2 
                OR int_eq.${userCol} = $2
            )
            LIMIT 1
        `, [eventoId, userId]);

        if (dupCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ success: false, error: 'Ya te encuentras registrado en este evento.' }, { status: 400 });
        }
    }
    // ------------------------------------------

    let inscripcionId;

    if (tipo === 'equipo') {
        if (!evento.permite_equipos) throw new Error('Este evento no permite registro por equipos');
        if (!equipo?.nombre) throw new Error('Nombre del equipo requerido');
        if (!integrantes || integrantes.length === 0) throw new Error('Se requiere al menos un integrante');
        if (evento.max_integrantes_equipo && integrantes.length > evento.max_integrantes_equipo) throw new Error(`El máximo de integrantes por equipo es ${evento.max_integrantes_equipo}`);
        if (evento.requiere_asesor && (!asesor?.nombre || !asesor?.email)) throw new Error('Datos del asesor requeridos');

        // Validar si el concurso existe para este evento
        if (!evento.id_concurso) throw new Error('Configuración de concurso no encontrada para este evento');

        // Crear Equipo
        // Usar strings vacíos o null seguros
        const teamRes = await client.query(
          `INSERT INTO equipo_concurso (id_concurso, nombre_equipo, nombre_asesor, correo_asesor, telefono_asesor, institucion_asesor, registro_completo)
           VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id_equipo`,
           [
             evento.id_concurso, 
             equipo.nombre, 
             asesor?.nombre || null, 
             asesor?.email || null, 
             asesor?.telefono || null, 
             asesor?.institucion || null
           ]
        );
        const teamId = teamRes.rows[0].id_equipo;

        // Agregar Integrantes
        for (const member of integrantes) {
             let memberId = null;
             let guestId = null;
             
             // Buscar si el email es de un miembro registrado
             if (member.email) {
                 const memRes = await client.query('SELECT id_miembro FROM miembro WHERE correo_electronico = $1', [member.email]);
                 if (memRes.rows.length > 0) memberId = memRes.rows[0].id_miembro;
             }
             
             // Si no es miembro, registrar/buscar invitado
             if (!memberId) {
                  const existingGuest = await client.query('SELECT id_invitado FROM invitado WHERE correo_electronico = $1', [member.email]);
                  if (existingGuest.rows.length > 0) {
                      guestId = existingGuest.rows[0].id_invitado;
                  } else {
                      const guestRes = await client.query(
                          'INSERT INTO invitado (nombre_completo, correo_electronico, numero_telefono, escuela_institucion, carrera, semestre) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_invitado',
                          [
                            member.nombre, 
                            member.email, 
                            member.telefono || '', 
                            member.institucion || '', 
                            member.carrera || '', 
                            member.semestre ? parseInt(member.semestre) : null
                          ]
                      );
                      guestId = guestRes.rows[0].id_invitado;
                  }
             }
             
             await client.query(
                 'INSERT INTO integrante_equipo (id_equipo, id_miembro, id_invitado, es_capitan) VALUES ($1, $2, $3, $4)',
                 [teamId, memberId, guestId, member.es_capitan || false]
             );
        }

        // Crear Inscripción del Equipo
        // Verificar duplicados de equipo (nombre ya se proteje en DB constraint)
        const insRes = await client.query(
             "INSERT INTO inscripcion_evento (id_evento, id_equipo, estado, fecha_inscripcion) VALUES ($1, $2, 'confirmada', NOW()) RETURNING id_inscripcion",
             [eventoId, teamId]
        );
        inscripcionId = insRes.rows[0].id_inscripcion;

    } else {
        // Registro Individual (Lógica existente)
        if (!userId) throw new Error('ID de usuario no válido para registro individual');
        
        // La verificación de duplicados ya se realizó al inicio

        let insertQuery = tipo === 'miembro'
            ? "INSERT INTO inscripcion_evento (id_evento, id_miembro, estado, fecha_inscripcion) VALUES ($1, $2, 'confirmada', NOW()) RETURNING id_inscripcion"
            : "INSERT INTO inscripcion_evento (id_evento, id_invitado, estado, fecha_inscripcion) VALUES ($1, $2, 'confirmada', NOW()) RETURNING id_inscripcion";
        
        const insRes = await client.query(insertQuery, [eventoId, userId]);
        inscripcionId = insRes.rows[0].id_inscripcion;
    }

    // Actualizar cupos (Simple update, trigger might handle detailed stats but we decr usable cups)
    // await client.query('UPDATE evento SET cupos_disponibles = cupos_disponibles - 1 WHERE id_evento = $1', [eventoId]);
    await client.query('COMMIT');

    // Generar un token seguro antes de enviar la respuesta
    const crypto = await import('crypto');
    const secret = process.env.Payload_SECRET || 'secret-key-crocoders-secure';
    const qrPayload = JSON.stringify({ id: inscripcionId, eid: eventoId, ts: Date.now() });
    const hash = crypto.createHmac('sha256', secret).update(qrPayload).digest('hex');
    const secureQrToken = Buffer.from(JSON.stringify({ data: qrPayload, sig: hash })).toString('base64');

    // Consulta FINAL: Obtener el estado actualizado del evento para el frontend
    const finalEventRes = await client.query(`
        SELECT 
            id_evento, nombre as nombre_evento, fecha_inicio as fecha, hora_inicio, cupos_disponibles,
            (SELECT COUNT(*) FROM inscripcion_evento WHERE id_evento = $1) as asistentes_count
        FROM evento WHERE id_evento = $1
    `, [eventoId]);
    const finalEvent = finalEventRes.rows[0];

    // Combinar con los datos originales (catalogo, etc) si es necesario, pero lo importante es cupos y count
    const eventToSend = {
        ...evento, // Propiedades originales (ubicación, tipo, etc)
        ...finalEvent, // Propiedades actualizadas (cupos, count)
        // Parsear fecha si es objeto
        fecha: finalEvent?.fecha instanceof Date ? finalEvent.fecha.toISOString().split('T')[0] : finalEvent?.fecha,
        asistentes_count: Number(finalEvent?.asistentes_count) || 0,
        cupos_disponibles: finalEvent?.cupos_disponibles !== null ? Number(finalEvent.cupos_disponibles) : null
    };
    
    return NextResponse.json({
      success: true,
      message: 'Registro exitoso',
      id_inscripcion: inscripcionId,
      qrToken: secureQrToken, 
      event: eventToSend 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en registro:', error);
    return NextResponse.json(
      { success: false, error: 'Error al registrarse: ' + error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
