import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { eventoRegisterSchema, parseOrError } from '@/lib/validation';
import { getSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { verificarInvitado } from '@/lib/invitado-token';
import { recalcularCupos, verificarDisponibilidad } from '@/lib/eventos-cupos';
import { sqlRegistroCerrado, sqlEventoTerminado } from '@/lib/eventos-fechas';

// Errores de reglas de negocio (no fallos del servidor). Antes todas estas
// validaciones eran `throw new Error(...)` y acababan en el catch genérico, así
// que el usuario leía "Error: Error al registrarse" en vez del motivo real.
class ValidationError extends Error {}

export async function POST(request) {
  // Registro mayormente público (invitados sin cuenta): limitar por IP para
  // evitar spam de inscripciones. Las constraints de BD evitan duplicados,
  // pero el rate-limit corta el abuso antes de tocar la DB.
  const rl = rateLimit(request, { scope: 'evento-register', limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos de registro. Intenta de nuevo más tarde.' },
      { status: 429 },
    );
  }

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
  // - 'equipo' exige sesión: antes cualquier anónimo podía inscribir un equipo
  //   a nombre de miembros reales con sólo conocer sus correos, y esas personas
  //   quedaban inscritas sin poder darse de baja (sólo el capitán puede).
  if (tipo === 'miembro' && !memberId) {
    return NextResponse.json({ success: false, error: 'Debes iniciar sesión para registrarte como miembro.' }, { status: 401 });
  }
  if (tipo === 'invitado' && memberId) {
    return NextResponse.json({ success: false, error: 'Ya tienes sesión iniciada; regístrate como miembro.' }, { status: 400 });
  }
  if (tipo === 'equipo' && !memberId) {
    return NextResponse.json(
      { success: false, error: 'Debes iniciar sesión para registrar un equipo. El capitán tiene que ser un miembro con cuenta.' },
      { status: 401 },
    );
  }

  // Identidad del invitado: NO se acepta el id_invitado suelto del cuerpo.
  // Los ids son secuenciales, así que aceptarlos permitía inscribir a terceros
  // (y quedarse con su ticket QR) recorriendo 1, 2, 3... Ahora sólo vale el
  // `guestToken` firmado que devuelve POST /api/invitados a quien acaba de
  // demostrar que conoce el correo. Viaja fuera del esquema zod porque éste es
  // una unión discriminada que descarta las claves desconocidas.
  let guestId = null;
  if (tipo === 'invitado') {
    const verificado = verificarInvitado(payload?.guestToken);
    if (!verificado.ok) {
      return NextResponse.json({ success: false, error: verificado.error }, { status: 400 });
    }
    guestId = verificado.idInvitado;
    // Si el cliente además manda userId, tiene que coincidir: así un cliente
    // desactualizado falla de forma visible en lugar de inscribir a otra persona.
    if (data.userId && Number(data.userId) !== guestId) {
      return NextResponse.json(
        { success: false, error: 'La credencial del invitado no corresponde a los datos enviados.' },
        { status: 400 },
      );
    }
  }

  const equipo = tipo === 'equipo' ? data.equipo : undefined;
  const integrantes = tipo === 'equipo' ? data.integrantes : undefined;
  const asesor = tipo === 'equipo' ? data.asesor : undefined;

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
    client = await connectWithRetry();
  } catch (connectionError) {
    console.error('Error de conexión en /api/eventos/register:', connectionError);
    return NextResponse.json(
      { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
      { status: 503 }
    );
  }

  try {
    await client.query('BEGIN');

    // Datos del evento + banderas de tiempo calculadas EN SQL con la zona fija
    // del club (ver src/lib/eventos-fechas.js). Comparar en JS convertía los
    // timestamps naive a UTC y cerraba el registro 6 h antes de lo anunciado.
    // El FOR UPDATE bloquea el evento durante toda la transacción: es lo que
    // hace atómico el conteo de lugares y el recálculo posterior de cupos.
    const eventoRes = await client.query(`
      SELECT e.id_evento, e.cupos, e.cupos_disponibles, e.estado, e.nombre,
             e.tiene_costo,
             ${sqlRegistroCerrado('e')} AS registro_cerrado,
             ${sqlEventoTerminado('e')} AS evento_terminado,
             c.id_concurso, c.modalidad, c.max_integrantes_equipo,
             c.min_integrantes_equipo, c.requiere_asesor, t.permite_equipos
      FROM evento e
      LEFT JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
      LEFT JOIN concurso c ON e.id_evento = c.id_evento
      WHERE e.id_evento = $1 AND e.deleted_at IS NULL FOR UPDATE OF e
    `, [eventoId]);

    if (eventoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Evento no encontrado' }, { status: 404 });
    }

    const evento = eventoRes.rows[0];

    // Estado del evento
    if (!['publicado', 'en_curso'].includes(evento.estado)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'El evento no está disponible para registros.' }, { status: 400 });
    }

    // Un evento que ya terminó no admite inscripciones aunque nadie haya
    // cambiado su `estado` a 'finalizado' (no hay ningún proceso que lo haga).
    if (evento.evento_terminado) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Este evento ya finalizó.' }, { status: 400 });
    }

    // Cierre de inscripciones (fecha límite, o 1 h antes del inicio si no hay).
    if (evento.registro_cerrado) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        success: false,
        error: 'El periodo de inscripción para este evento ha finalizado.',
      }, { status: 400 });
    }

    // --- VERIFICACIÓN ROBUSTA DE DUPLICADOS ---
    // Comprueba inscripción directa O pertenencia a un equipo ya inscrito,
    // SOLO contra inscripciones activas (no canceladas).
    if (memberId) {
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

    // Eventos con costo: la inscripción NO puede nacer confirmada mientras no
    // exista ninguna pasarela de pago en el proyecto. Queda 'pendiente' y
    // marcada como `requiere_pago` hasta que un administrador registre el cobro
    // desde /api/admin/inscripciones/[id]. El lugar queda igualmente apartado.
    const estadoInicial = evento.tiene_costo ? 'pendiente' : 'confirmada';
    const requierePago = Boolean(evento.tiene_costo);

    let inscripcionId;
    // Lugares que consume esta inscripción (un equipo ocupa uno por integrante).
    let lugaresSolicitados = 1;
    // Integrantes ya resueltos a miembro/invitado, para insertarlos tras validar.
    let integrantesResueltos = [];

    if (tipo === 'equipo') {
      if (!evento.permite_equipos) throw new ValidationError('Este evento no permite registro por equipos.');
      if (!evento.id_concurso) throw new ValidationError('Configuración de concurso no encontrada para este evento.');
      // La modalidad del concurso manda sobre el flag del catálogo de tipos:
      // en 'individual' el esquema obliga a max_integrantes_equipo NULL, así
      // que sin esta comprobación entraban "equipos" de hasta 10 personas.
      if (evento.modalidad !== 'equipos') {
        throw new ValidationError('Este concurso es de modalidad individual; no admite registro por equipos.');
      }
      if (!equipo?.nombre) throw new ValidationError('Nombre del equipo requerido.');
      if (!integrantes || integrantes.length === 0) throw new ValidationError('Se requiere al menos un integrante.');
      if (evento.min_integrantes_equipo && integrantes.length < evento.min_integrantes_equipo) {
        throw new ValidationError(`El mínimo de integrantes por equipo es ${evento.min_integrantes_equipo}.`);
      }
      // Tope duro aunque el concurso no lo configure, para no depender de un NULL.
      const maxIntegrantes = evento.max_integrantes_equipo || 5;
      if (integrantes.length > maxIntegrantes) {
        throw new ValidationError(`El máximo de integrantes por equipo es ${maxIntegrantes}.`);
      }
      if (evento.requiere_asesor && (!asesor?.nombre || !asesor?.email)) {
        throw new ValidationError('Datos del asesor requeridos.');
      }

      // Correos únicos: repetir uno creaba dos filas en integrante_equipo para
      // la misma persona y consumía dos lugares.
      const correos = integrantes.map((i) => String(i.email || '').trim().toLowerCase());
      if (correos.some((c) => !c)) throw new ValidationError('Todos los integrantes deben indicar su correo.');
      if (new Set(correos).size !== correos.length) {
        throw new ValidationError('Hay correos repetidos entre los integrantes del equipo.');
      }

      // 1) Resolver TODOS los integrantes antes de escribir nada: quién es
      //    miembro y quién es un invitado que ya existe.
      const miembrosRes = await client.query(
        `SELECT id_miembro, LOWER(correo_electronico) AS correo
           FROM miembro
          WHERE LOWER(correo_electronico) = ANY($1::text[]) AND deleted_at IS NULL`,
        [correos],
      );
      const porCorreoMiembro = new Map(miembrosRes.rows.map((r) => [r.correo, r.id_miembro]));

      const invitadosRes = await client.query(
        `SELECT id_invitado, LOWER(correo_electronico) AS correo
           FROM invitado
          WHERE LOWER(correo_electronico) = ANY($1::text[])`,
        [correos],
      );
      const porCorreoInvitado = new Map(invitadosRes.rows.map((r) => [r.correo, r.id_invitado]));

      integrantesResueltos = integrantes.map((integrante, i) => ({
        datos: integrante,
        correo: correos[i],
        idMiembro: porCorreoMiembro.get(correos[i]) ?? null,
        idInvitado: porCorreoMiembro.has(correos[i]) ? null : (porCorreoInvitado.get(correos[i]) ?? null),
        esCapitan: false,
      }));

      // 2) El capitán tiene que ser quien está registrando el equipo. Así nadie
      //    inscribe a terceros a su nombre, y ningún equipo se queda sin capitán
      //    (sin capitán nadie puede darlo de baja y el correo de confirmación se
      //    queda sin destinatario).
      const yo = integrantesResueltos.find((r) => r.idMiembro === memberId);
      if (!yo) {
        throw new ValidationError('Debes formar parte del equipo que registras: incluye tu propio correo entre los integrantes.');
      }
      const capitanesMarcados = integrantesResueltos.filter((r) => r.datos.es_capitan);
      if (capitanesMarcados.length > 1) throw new ValidationError('El equipo sólo puede tener un capitán.');
      if (capitanesMarcados.length === 1 && capitanesMarcados[0] !== yo) {
        throw new ValidationError('El capitán del equipo debe ser quien realiza el registro.');
      }
      yo.esCapitan = true;

      // 3) Ningún integrante puede estar ya inscrito (ni por su cuenta ni en
      //    otro equipo): antes la misma persona ocupaba dos o tres lugares.
      const idsMiembro = integrantesResueltos.map((r) => r.idMiembro).filter(Boolean);
      const idsInvitado = integrantesResueltos.map((r) => r.idInvitado).filter(Boolean);
      if (idsMiembro.length > 0 || idsInvitado.length > 0) {
        const yaRes = await client.query(
          `SELECT ie.id_miembro AS ins_miembro, ie.id_invitado AS ins_invitado,
                  int_eq.id_miembro AS eq_miembro, int_eq.id_invitado AS eq_invitado
             FROM inscripcion_evento ie
             LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
             LEFT JOIN integrante_equipo int_eq ON eq.id_equipo = int_eq.id_equipo
            WHERE ie.id_evento = $1
              AND ie.estado <> 'cancelada'
              AND (ie.id_miembro = ANY($2::int[]) OR int_eq.id_miembro = ANY($2::int[])
                OR ie.id_invitado = ANY($3::int[]) OR int_eq.id_invitado = ANY($3::int[]))`,
          [eventoId, idsMiembro, idsInvitado],
        );
        if (yaRes.rows.length > 0) {
          const miembrosOcupados = new Set();
          const invitadosOcupados = new Set();
          for (const fila of yaRes.rows) {
            if (fila.ins_miembro) miembrosOcupados.add(fila.ins_miembro);
            if (fila.eq_miembro) miembrosOcupados.add(fila.eq_miembro);
            if (fila.ins_invitado) invitadosOcupados.add(fila.ins_invitado);
            if (fila.eq_invitado) invitadosOcupados.add(fila.eq_invitado);
          }
          const enConflicto = integrantesResueltos
            .filter((r) => (r.idMiembro && miembrosOcupados.has(r.idMiembro))
                        || (r.idInvitado && invitadosOcupados.has(r.idInvitado)))
            .map((r) => r.correo);
          if (enConflicto.length > 0) {
            throw new ValidationError(`Ya hay integrantes inscritos en este evento: ${enConflicto.join(', ')}.`);
          }
        }
      }

      lugaresSolicitados = integrantesResueltos.length;
    }

    // Cupos: se decide contra las INSCRIPCIONES REALES, no contra el contador
    // `cupos_disponibles` (que puede venir desfasado de datos antiguos y que
    // además mide filas, no lugares). `cupos IS NULL` = aforo ilimitado; antes
    // `null <= 0` daba true y esos eventos rechazaban todo registro.
    const disponibilidad = await verificarDisponibilidad(client, eventoId, evento.cupos, lugaresSolicitados);
    if (!disponibilidad.cabe) {
      await client.query('ROLLBACK');
      const mensaje = lugaresSolicitados > 1
        ? `No hay cupos suficientes: quedan ${disponibilidad.libres} lugares y el equipo necesita ${lugaresSolicitados}.`
        : 'No hay cupos disponibles para este evento';
      return NextResponse.json({ success: false, error: mensaje }, { status: 400 });
    }

    if (tipo === 'equipo') {
      const teamRes = await client.query(
        `INSERT INTO equipo_concurso (id_concurso, nombre_equipo, nombre_asesor, correo_asesor, telefono_asesor, institucion_asesor, registro_completo)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id_equipo`,
        [
          evento.id_concurso,
          equipo.nombre,
          asesor?.nombre || null,
          asesor?.email || null,
          asesor?.telefono || null,
          asesor?.institucion || null,
        ],
      );
      const teamId = teamRes.rows[0].id_equipo;

      for (const r of integrantesResueltos) {
        // Los integrantes que no son miembros se dan de alta como invitados.
        if (!r.idMiembro && !r.idInvitado) {
          const guestRes = await client.query(
            `INSERT INTO invitado (nombre_completo, correo_electronico, numero_telefono, escuela_institucion, carrera, semestre)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_invitado`,
            [
              r.datos.nombre,
              r.correo,
              r.datos.telefono || null,
              r.datos.institucion || null,
              r.datos.carrera || null,
              r.datos.semestre ? parseInt(r.datos.semestre) : null,
            ],
          );
          r.idInvitado = guestRes.rows[0].id_invitado;
        }

        await client.query(
          'INSERT INTO integrante_equipo (id_equipo, id_miembro, id_invitado, es_capitan) VALUES ($1, $2, $3, $4)',
          [teamId, r.idMiembro, r.idInvitado, r.esCapitan],
        );
      }

      const insRes = await client.query(
        `INSERT INTO inscripcion_evento (id_evento, id_equipo, estado, requiere_pago, fecha_inscripcion)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING id_inscripcion`,
        [eventoId, teamId, estadoInicial, requierePago],
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
        `INSERT INTO inscripcion_evento (id_evento, id_miembro, estado, requiere_pago, fecha_inscripcion)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT ON CONSTRAINT inscripcion_evento_id_evento_id_miembro_key
         DO UPDATE SET estado = EXCLUDED.estado, requiere_pago = EXCLUDED.requiere_pago,
                       fecha_inscripcion = NOW(), updated_at = NOW()
         RETURNING id_inscripcion`,
        [eventoId, memberId, estadoInicial, requierePago],
      );
      inscripcionId = insRes.rows[0].id_inscripcion;
    } else {
      // Registro individual de un invitado (externo sin cuenta). El id viene
      // del guestToken firmado, ya verificado arriba; comprobamos que la fila
      // siga existiendo para devolver un error claro en vez de un 23503 -> 500.
      const guestExists = await client.query('SELECT 1 FROM invitado WHERE id_invitado = $1', [guestId]);
      if (guestExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ success: false, error: 'Invitado no encontrado. Vuelve a completar tus datos.' }, { status: 404 });
      }

      const insRes = await client.query(
        `INSERT INTO inscripcion_evento (id_evento, id_invitado, estado, requiere_pago, fecha_inscripcion)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT ON CONSTRAINT inscripcion_evento_id_evento_id_invitado_key
         DO UPDATE SET estado = EXCLUDED.estado, requiere_pago = EXCLUDED.requiere_pago,
                       fecha_inscripcion = NOW(), updated_at = NOW()
         RETURNING id_inscripcion`,
        [eventoId, guestId, estadoInicial, requierePago],
      );
      inscripcionId = insRes.rows[0].id_inscripcion;
    }

    // Contabilidad de cupos: un único punto de ajuste. `recalcularCupos` deriva
    // `cupos_disponibles` de las inscripciones reales y pisa lo que haya hecho
    // el trigger de la BD (que cuenta filas, no lugares, y sólo reacciona a
    // 'confirmada'). Ver src/lib/eventos-cupos.js.
    const cuposFinales = await recalcularCupos(client, eventoId);

    // Generar el token del QR y leer el estado final ANTES del COMMIT. Si algo
    // de esto fallara, el catch hace ROLLBACK y el registro no queda a medias.
    const crypto = await import('crypto');
    const qrPayload = JSON.stringify({ id: inscripcionId, eid: eventoId, ts: Date.now() });
    const hash = crypto.createHmac('sha256', payloadSecret).update(qrPayload).digest('hex');
    const secureQrToken = Buffer.from(JSON.stringify({ data: qrPayload, sig: hash })).toString('base64');

    // Estado actualizado del evento para el frontend (cupos y conteo).
    const finalEventRes = await client.query(`
        SELECT
            id_evento, nombre as nombre_evento, fecha_inicio as fecha, hora_inicio, cupos, cupos_disponibles,
            (SELECT COUNT(*) FROM inscripcion_evento WHERE id_evento = $1 AND estado <> 'cancelada') as asistentes_count
        FROM evento WHERE id_evento = $1
    `, [eventoId]);
    const finalEvent = finalEventRes.rows[0];

    await client.query('COMMIT');

    const eventToSend = {
      ...evento, // Propiedades originales (concurso, permite_equipos, etc.)
      ...finalEvent, // Propiedades actualizadas (cupos, count)
      fecha: finalEvent?.fecha instanceof Date ? finalEvent.fecha.toISOString().split('T')[0] : finalEvent?.fecha,
      asistentes_count: Number(finalEvent?.asistentes_count) || 0,
      cupos_disponibles: finalEvent?.cupos_disponibles !== null ? Number(finalEvent.cupos_disponibles) : null,
      // Lugares ocupados contando los integrantes de cada equipo. `asistentes_count`
      // cuenta FILAS de inscripción: no son la misma unidad y no deben compararse.
      lugares_ocupados: cuposFinales.lugares_ocupados,
    };

    return NextResponse.json({
      success: true,
      message: requierePago
        ? 'Registro recibido. Tu lugar queda apartado hasta que se verifique el pago.'
        : 'Registro exitoso',
      id_inscripcion: inscripcionId,
      // Estado real de la inscripción, para que la UI no prometa "confirmada"
      // en un evento de pago que aún nadie ha cobrado.
      estado_inscripcion: estadoInicial,
      requiere_pago: requierePago,
      qrToken: secureQrToken,
      event: eventToSend
    });

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error en ROLLBACK:', rollbackError);
      }
    }

    // Reglas de negocio: el mensaje redactado es para el usuario, no un 500.
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    console.error('Error en registro:', error);

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
