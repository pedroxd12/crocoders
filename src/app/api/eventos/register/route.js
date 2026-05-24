import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { eventoRegisterSchema, parseOrError } from '@/lib/validation';
import { getSession } from '@/lib/auth';

export async function POST(request) {
  // Autenticación OPCIONAL: los miembros llegan con sesión (JWT), pero los
  // invitados se registran sin cuenta. La identidad se resuelve por `tipo`.
  const session = await getSession(request);
  const memberId = session ? Number(session.id) : null;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  const [data, errPayload] = parseOrError(eventoRegisterSchema, payload);
  if (errPayload) {
    return NextResponse.json(errPayload, { status: 400 });
  }
  const { eventoId, tipo } = data;

  // Coherencia identidad ↔ tipo:
  // - 'miembro' exige sesión (sólo los miembros tienen JWT).
  // - 'invitado' es para externos sin cuenta; si hay sesión, el usuario es
  //   miembro y no debería registrarse como invitado.
  if (tipo === 'miembro' && !memberId) {
    return NextResponse.json({ success: false, error: 'Debes iniciar sesión para registrarte como miembro.' }, { status: 401 });
  }
  if (tipo === 'invitado' && memberId) {
    return NextResponse.json({ success: false, error: 'Ya tienes sesión iniciada; regístrate como miembro.' }, { status: 400 });
  }
  // Para 'invitado', la identidad es el id_invitado que viene en el payload.
  const guestId = tipo === 'invitado' ? Number(data.userId) : null;
  const equipo = data.tipo === 'equipo' ? data.equipo : undefined;
  const integrantes = data.tipo === 'equipo' ? data.integrantes : undefined;
  const asesor = data.tipo === 'equipo' ? data.asesor : undefined;

  // Fail-fast del secreto del QR: si falta, abortamos ANTES de tocar la DB para
  // no dejar una inscripción confirmada y devolver 500 (el QR se genera dentro
  // de la transacción, así que sin secreto no podríamos completar el registro).
  const payloadSecret = process.env.PAYLOAD_SECRET;
  if (!payloadSecret) {
    console.error('PAYLOAD_SECRET no configurado: no se puede emitir el QR de inscripción.');
    return NextResponse.json(
      { success: false, error: 'El servidor no está configurado para emitir el ticket de acceso. Contacta al administrador.', code: 'QR_SECRET_MISSING' },
      { status: 500 },
    );
  }

  let client;
  try {
    client = await pool.connect();
  } catch (connectionError) {
    console.error('Error de conexión en /api/eventos/register:', connectionError);
    return NextResponse.json(
      { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
      { status: 503 }
    );
  }

  try {

    await client.query('BEGIN');

    // Obtener información del evento y si es concurso (equipos)
    const eventoRes = await client.query(`
      SELECT e.id_evento, e.cupos_disponibles, e.estado, e.nombre, e.fecha_limite_registro,
             c.id_concurso, c.max_integrantes_equipo, c.min_integrantes_equipo, c.requiere_asesor, t.permite_equipos
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
      const now = Date.now();
      const fechaLimite = new Date(evento.fecha_limite_registro).getTime();

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
    // Comprueba inscripción directa O pertenencia a un equipo ya inscrito,
    // SOLO contra inscripciones activas (no canceladas).
    if (memberId) {
        // Miembro: inscripción directa o como integrante de un equipo.
        const dupCheck = await client.query(`
            SELECT 1
            FROM inscripcion_evento ie
            LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
            LEFT JOIN integrante_equipo int_eq ON eq.id_equipo = int_eq.id_equipo
            WHERE ie.id_evento = $1
              AND ie.estado <> 'cancelada'
              AND (ie.id_miembro = $2 OR int_eq.id_miembro = $2)
            LIMIT 1
        `, [eventoId, memberId]);

        if (dupCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ success: false, error: 'Ya te encuentras registrado en este evento.' }, { status: 400 });
        }
    } else if (guestId) {
        // Invitado: inscripción directa con su id_invitado.
        const dupCheck = await client.query(
            `SELECT 1 FROM inscripcion_evento
              WHERE id_evento = $1 AND id_invitado = $2 AND estado <> 'cancelada' LIMIT 1`,
            [eventoId, guestId],
        );
        if (dupCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ success: false, error: 'Este invitado ya se encuentra registrado en este evento.' }, { status: 400 });
        }
    }
    // ------------------------------------------

    let inscripcionId;

    if (tipo === 'equipo') {
        if (!evento.permite_equipos) throw new Error('Este evento no permite registro por equipos');
        if (!equipo?.nombre) throw new Error('Nombre del equipo requerido');
        if (!integrantes || integrantes.length === 0) throw new Error('Se requiere al menos un integrante');
        if (evento.min_integrantes_equipo && integrantes.length < evento.min_integrantes_equipo) throw new Error(`El mínimo de integrantes por equipo es ${evento.min_integrantes_equipo}`);
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

        // Agregar Integrantes. Cada integrante se vincula a un miembro (por email)
        // o se registra como invitado. Variables locales al loop (no confundir con
        // memberId/guestId del scope superior, que identifican a quien inscribe).
        for (const member of integrantes) {
             let mId = null;
             let gId = null;

             // Buscar si el email es de un miembro registrado
             if (member.email) {
                 const memRes = await client.query('SELECT id_miembro FROM miembro WHERE correo_electronico = $1', [member.email]);
                 if (memRes.rows.length > 0) mId = memRes.rows[0].id_miembro;
             }

             // Si no es miembro, registrar/buscar invitado
             if (!mId) {
                  const existingGuest = await client.query('SELECT id_invitado FROM invitado WHERE correo_electronico = $1', [member.email]);
                  if (existingGuest.rows.length > 0) {
                      gId = existingGuest.rows[0].id_invitado;
                  } else {
                      const guestRes = await client.query(
                          'INSERT INTO invitado (nombre_completo, correo_electronico, numero_telefono, escuela_institucion, carrera, semestre) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_invitado',
                          [
                            member.nombre,
                            member.email,
                            member.telefono || null,
                            member.institucion || null,
                            member.carrera || null,
                            member.semestre ? parseInt(member.semestre) : null
                          ]
                      );
                      gId = guestRes.rows[0].id_invitado;
                  }
             }

             await client.query(
                 'INSERT INTO integrante_equipo (id_equipo, id_miembro, id_invitado, es_capitan) VALUES ($1, $2, $3, $4)',
                 [teamId, mId, gId, member.es_capitan || false]
             );
        }

        // Crear Inscripción del Equipo
        // Verificar duplicados de equipo (nombre ya se proteje en DB constraint)
        const insRes = await client.query(
             "INSERT INTO inscripcion_evento (id_evento, id_equipo, estado, fecha_inscripcion) VALUES ($1, $2, 'confirmada', NOW()) RETURNING id_inscripcion",
             [eventoId, teamId]
        );
        inscripcionId = insRes.rows[0].id_inscripcion;

    } else if (tipo === 'miembro') {
        // Registro individual de un miembro autenticado.
        // Si existe una inscripción previa CANCELADA (las activas ya se filtraron
        // en el dupCheck), la reactivamos en vez de chocar con el UNIQUE.
        // El conflicto se resuelve por el constraint UNIQUE (id_evento, id_miembro)
        // de la tabla. NO se usa `ON CONFLICT (...) WHERE ...` porque ese constraint
        // NO es un índice parcial y Postgres no lo encontraría (error 42P10).
        const insRes = await client.query(
            `INSERT INTO inscripcion_evento (id_evento, id_miembro, estado, fecha_inscripcion)
             VALUES ($1, $2, 'confirmada', NOW())
             ON CONFLICT ON CONSTRAINT inscripcion_evento_id_evento_id_miembro_key
             DO UPDATE SET estado = 'confirmada', fecha_inscripcion = NOW(), updated_at = NOW()
             RETURNING id_inscripcion`,
            [eventoId, memberId],
        );
        inscripcionId = insRes.rows[0].id_inscripcion;
    } else {
        // Registro individual de un invitado (externo sin cuenta).
        // El id_invitado ya fue creado vía POST /api/invitados. Verificamos que
        // exista para devolver un error claro en vez de un 23503 (FK) → 500.
        const guestExists = await client.query('SELECT 1 FROM invitado WHERE id_invitado = $1', [guestId]);
        if (guestExists.rows.length === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ success: false, error: 'Invitado no encontrado. Vuelve a completar tus datos.' }, { status: 404 });
        }

        const insRes = await client.query(
            `INSERT INTO inscripcion_evento (id_evento, id_invitado, estado, fecha_inscripcion)
             VALUES ($1, $2, 'confirmada', NOW())
             ON CONFLICT ON CONSTRAINT inscripcion_evento_id_evento_id_invitado_key
             DO UPDATE SET estado = 'confirmada', fecha_inscripcion = NOW(), updated_at = NOW()
             RETURNING id_inscripcion`,
            [eventoId, guestId],
        );
        inscripcionId = insRes.rows[0].id_inscripcion;
    }

    // NOTA: el trigger `actualizar_cupos_evento` en la DB ya descuenta 1 cupo
    // al insertar una inscripción 'confirmada'. Por eso NO restamos el primer
    // cupo a mano. Para equipos, que cuentan como N personas, ajustamos solo
    // los (N-1) cupos adicionales.
    const lugaresConsumidos = tipo === 'equipo' ? integrantes.length : 1;
    const ajusteExtra = lugaresConsumidos - 1; // lo que el trigger no cubre

    if (ajusteExtra > 0) {
      const cupoRes = await client.query(
        'UPDATE evento SET cupos_disponibles = cupos_disponibles - $2 WHERE id_evento = $1 AND cupos_disponibles >= $2 RETURNING cupos_disponibles',
        [eventoId, ajusteExtra],
      );
      if (cupoRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: `No hay cupos suficientes para un equipo de ${lugaresConsumidos} integrantes` },
          { status: 400 },
        );
      }
    }

    // Generar el token del QR y leer el estado final ANTES del COMMIT. Si algo
    // de esto fallara, el catch hace ROLLBACK y el registro no queda a medias.
    // Tras el COMMIT solo construimos la respuesta con datos ya en memoria, de
    // modo que nada posterior pueda tumbar una inscripción ya confirmada.
    const crypto = await import('crypto');
    const qrPayload = JSON.stringify({ id: inscripcionId, eid: eventoId, ts: Date.now() });
    const hash = crypto.createHmac('sha256', payloadSecret).update(qrPayload).digest('hex');
    const secureQrToken = Buffer.from(JSON.stringify({ data: qrPayload, sig: hash })).toString('base64');

    // Estado actualizado del evento para el frontend (cupos y conteo).
    const finalEventRes = await client.query(`
        SELECT
            id_evento, nombre as nombre_evento, fecha_inicio as fecha, hora_inicio, cupos_disponibles,
            (SELECT COUNT(*) FROM inscripcion_evento WHERE id_evento = $1 AND estado <> 'cancelada') as asistentes_count
        FROM evento WHERE id_evento = $1
    `, [eventoId]);
    const finalEvent = finalEventRes.rows[0];

    await client.query('COMMIT');

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
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('⚠️ Error en ROLLBACK:', rollbackError);
      }
    }
    console.error('💥 Error en registro:', error);

    // Conflicto único: ya existe una inscripción del mismo usuario / equipo en el evento.
    if (error.code === '23505') {
      const target = error.constraint || '';
      let mensaje = 'Ya te encuentras registrado en este evento.';
      if (target.includes('equipo')) {
        mensaje = 'Ya existe un equipo con ese nombre o un integrante ya está inscrito.';
      }
      return NextResponse.json(
        { success: false, error: mensaje, code: 'ALREADY_REGISTERED' },
        { status: 409 }
      );
    }

    // Manejo específico de errores de conexión
    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Error al registrarse' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}
