import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { recalcularCupos, verificarDisponibilidad } from '@/lib/eventos-cupos';
import { ValidationError, resolverEquipo, insertarEquipo } from '@/lib/eventos-equipo';
import { resolverRetoDeInscripcion } from '@/lib/retos';
import {
  invitadoSchema, equipoSchema, integranteSchema, asesorSchema, parseOrError,
} from '@/lib/validation';
import { TALLAS_PLAYERA } from '@/lib/registro-campos';
import { MAX_INTEGRANTES_EQUIPO, MAX_ASESORES_EQUIPO } from '@/lib/concurso-reglas';
import { esPorEquipos } from '@/lib/aforo';
import { firmarQrToken } from '@/lib/qr-token';
import { enviarConfirmacionEvento } from '@/lib/correo-inscripcion';

// Mismo contrato que el flujo público de equipos, validado con las mismas
// piezas zod (los CHECK de la base son los mismos venga de donde venga).
const equipoPayloadSchema = z.object({
  equipo: equipoSchema,
  integrantes: z.array(integranteSchema).min(1).max(MAX_INTEGRANTES_EQUIPO),
  asesores: z.array(asesorSchema).max(MAX_ASESORES_EQUIPO).optional(),
});

// POST: un administrador inscribe manualmente en un evento. Debe pedir los
// MISMOS datos que el formulario público, así que acepta cuatro formas:
//   - tipo_usuario 'miembro' | 'invitado': persona existente por id
//     (+ talla_playera cuando el evento la solicita).
//   - tipo_usuario 'invitado_nuevo': ficha completa del invitado (los campos de
//     /api/invitados); se hace upsert por correo y se inscribe.
//   - tipo_usuario 'equipo': equipo/integrantes/asesores como el flujo público,
//     con la diferencia de que el admin no tiene que formar parte del equipo.
// `forzar` permite registrar por encima del aforo (se amplía `cupos` para que
// el número no mienta); `pago_completado` marca el cobro en eventos con costo.
// Al terminar se envía el correo con el ticket QR (a todo el equipo si lo es),
// salvo que el admin mande `enviar_correo: false`.
export async function POST(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  const { id_evento, id_usuario, tipo_usuario, forzar, pago_completado, id_reto } = body;
  const enviarCorreo = body.enviar_correo !== false;

  const eventoId = Number(id_evento);
  if (!Number.isInteger(eventoId) || eventoId <= 0) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }
  if (!['miembro', 'invitado', 'invitado_nuevo', 'equipo'].includes(tipo_usuario)) {
    return NextResponse.json(
      { error: "tipo_usuario debe ser 'miembro', 'invitado', 'invitado_nuevo' o 'equipo'" },
      { status: 400 },
    );
  }

  // La talla sólo aplica al registro individual y tiene que ser una válida.
  const tallaPayload = typeof body.talla_playera === 'string' && body.talla_playera !== ''
    ? body.talla_playera
    : null;
  if (tallaPayload && !TALLAS_PLAYERA.includes(tallaPayload)) {
    return NextResponse.json({ error: 'Talla de playera no válida' }, { status: 400 });
  }

  // El ticket se emite dentro de la transacción: sin secreto no hay registro.
  const payloadSecret = process.env.PAYLOAD_SECRET;
  if (!payloadSecret) {
    console.error('PAYLOAD_SECRET no configurado: no se puede emitir el QR de inscripción.');
    return NextResponse.json(
      { error: 'El servidor no está configurado para emitir el ticket de acceso.', code: 'QR_SECRET_MISSING' },
      { status: 500 },
    );
  }

  const client = await connectWithRetry();
  try {
    await client.query('BEGIN');

    // 1. Bloquear la fila del evento para decidir cupos de forma atómica. El
    //    JOIN a concurso/catálogo trae lo que valida el registro por equipos y
    //    `solicitar_talla` (mismas columnas que usa el flujo público).
    const eventRes = await client.query(
      `SELECT e.id_evento, e.cupos, e.cupos_disponibles, e.tiene_costo, e.solicitar_talla,
              c.id_concurso, c.modalidad, c.max_integrantes_equipo,
              c.min_integrantes_equipo, c.requiere_asesor, c.max_asesores,
              t.permite_equipos
         FROM evento e
         LEFT JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
         LEFT JOIN concurso c ON e.id_evento = c.id_evento
        WHERE e.id_evento = $1 AND e.deleted_at IS NULL
        FOR UPDATE OF e`,
      [eventoId],
    );

    if (eventRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    const evento = eventRes.rows[0];
    const porEquipos = esPorEquipos(evento);

    // Misma regla que el flujo público: en un concurso por equipos sólo entran
    // equipos (una persona suelta ocuparía el cupo de un equipo entero).
    if (porEquipos && tipo_usuario !== 'equipo') {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Este evento se inscribe por equipos: usa el formulario de equipo.' },
        { status: 400 },
      );
    }

    // Para eventos con costo, el pago lo marca explícitamente el admin.
    // Coherencia con el registro público: en un evento con costo la inscripción
    // sólo nace 'confirmada' si el admin marca el pago; si no, queda 'pendiente'
    // (el lugar sigue apartado) hasta que registre el cobro.
    const requierePago = Boolean(evento.tiene_costo);
    const pago = requierePago ? Boolean(pago_completado) : false;
    const estadoInicial = requierePago && !pago ? 'pendiente' : 'confirmada';

    // Desafío elegido. Mismas reglas que el registro público, salvo que
    // `forzar` también salta el cupo del reto: si el admin puede inscribir por
    // encima del aforo del evento, puede hacerlo por encima del de un reto.
    const reto = await resolverRetoDeInscripcion(client, eventoId, id_reto, { forzar: Boolean(forzar) });
    if (!reto.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: reto.error }, { status: 400 });
    }

    let inscripcionId;

    if (tipo_usuario === 'equipo') {
      // ---- Registro de equipo, con las mismas reglas que el flujo público
      // (capitanId null: el admin inscribe en nombre del equipo). ----
      const [datosEquipo, errEquipo] = parseOrError(equipoPayloadSchema, {
        equipo: body.equipo,
        integrantes: body.integrantes,
        asesores: body.asesores,
      });
      if (errEquipo) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: errEquipo.error }, { status: 400 });
      }

      const resuelto = await resolverEquipo(client, evento, datosEquipo, { capitanId: null });

      // Un equipo ocupa UN cupo (el aforo de un concurso por equipos se cuenta
      // en equipos, src/lib/aforo.js).
      if (!forzar) {
        const disponibilidad = await verificarDisponibilidad(client, eventoId, evento.cupos);
        if (!disponibilidad.cabe) {
          await client.query('ROLLBACK');
          return NextResponse.json({
            error: 'Ya no hay cupo para más equipos. Marca «Forzar registro» para inscribirlo de todos modos.',
          }, { status: 400 });
        }
      }

      inscripcionId = await insertarEquipo(client, {
        eventoId,
        idConcurso: evento.id_concurso,
        equipo: datosEquipo.equipo,
        asesores: resuelto.asesores,
        integrantesResueltos: resuelto.integrantesResueltos,
        estadoInicial,
        requierePago,
        idReto: reto.idReto,
      });

      // La inserción compartida no conoce el pago (el flujo público siempre
      // nace pendiente); si el admin ya cobró, la fila debe reflejarlo o el
      // estado 'confirmada' quedaría incoherente con pago_completado=false.
      if (pago) {
        await client.query(
          'UPDATE inscripcion_evento SET pago_completado = true, updated_at = NOW() WHERE id_inscripcion = $1',
          [inscripcionId],
        );
      }
    } else {
      // ---- Registro individual: persona existente o invitado nuevo. ----
      let usuarioId;
      let col;

      if (tipo_usuario === 'invitado_nuevo') {
        const [datosInvitado, errInvitado] = parseOrError(invitadoSchema, body.invitado ?? {});
        if (errInvitado) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: errInvitado.error }, { status: 400 });
        }

        // Si el correo pertenece a un miembro no se crea una segunda identidad
        // de la misma persona: se le inscribe desde la lista de usuarios.
        const miembroRes = await client.query(
          `SELECT 1 FROM miembro
            WHERE LOWER(correo_electronico) = $1 AND deleted_at IS NULL LIMIT 1`,
          [datosInvitado.correo_electronico],
        );
        if (miembroRes.rows.length > 0) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: 'Ese correo pertenece a un miembro del club: selecciónalo en la lista de usuarios existentes.' },
            { status: 409 },
          );
        }

        // Mismo upsert que POST /api/invitados: la identidad (nombre, contacto)
        // sólo se rellena si faltaba; edad, nivel, talla y número de control se
        // actualizan porque cambian con el tiempo y el dato nuevo es el bueno.
        const upsert = await client.query(
          `INSERT INTO invitado (nombre_completo, correo_electronico, numero_telefono, escuela_institucion, carrera, numero_control, semestre, nivel_estudios, edad, talla_playera)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (correo_electronico) DO UPDATE SET
             nombre_completo     = COALESCE(invitado.nombre_completo, EXCLUDED.nombre_completo),
             numero_telefono     = COALESCE(invitado.numero_telefono, EXCLUDED.numero_telefono),
             escuela_institucion = COALESCE(invitado.escuela_institucion, EXCLUDED.escuela_institucion),
             carrera             = COALESCE(invitado.carrera, EXCLUDED.carrera),
             semestre            = COALESCE(invitado.semestre, EXCLUDED.semestre),
             nivel_estudios      = COALESCE(EXCLUDED.nivel_estudios, invitado.nivel_estudios),
             edad                = COALESCE(EXCLUDED.edad, invitado.edad),
             talla_playera       = COALESCE(EXCLUDED.talla_playera, invitado.talla_playera),
             numero_control      = COALESCE(EXCLUDED.numero_control, invitado.numero_control),
             updated_at          = NOW()
           RETURNING id_invitado`,
          [
            datosInvitado.nombre_completo,
            datosInvitado.correo_electronico,
            datosInvitado.numero_telefono || null,
            datosInvitado.escuela_institucion || null,
            datosInvitado.carrera || null,
            datosInvitado.numero_control || null,
            datosInvitado.semestre ?? null,
            datosInvitado.nivel_estudios || null,
            datosInvitado.edad ?? null,
            datosInvitado.talla_playera || null,
          ],
        );
        usuarioId = upsert.rows[0].id_invitado;
        col = 'id_invitado';
      } else {
        usuarioId = Number(id_usuario);
        if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: 'ID de usuario inválido' }, { status: 400 });
        }
        col = tipo_usuario === 'miembro' ? 'id_miembro' : 'id_invitado';

        // 2. Verificar que exista (FK clara en vez de 23503 -> 500) y de paso
        //    leer su talla guardada para la regla de `solicitar_talla`.
        const targetTable = tipo_usuario === 'miembro' ? 'miembro' : 'invitado';
        const userRes = await client.query(
          `SELECT talla_playera FROM ${targetTable} WHERE ${col} = $1`,
          [usuarioId],
        );
        if (userRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: tipo_usuario === 'miembro' ? 'Miembro no encontrado' : 'Invitado no encontrado' },
            { status: 404 },
          );
        }

        // Talla enviada por el admin: en un invitado se actualiza (dato
        // operativo); en un miembro sólo se RELLENA si no tenía, porque ese
        // dato lo administra el propio miembro desde su cuenta.
        if (tallaPayload) {
          if (tipo_usuario === 'invitado') {
            await client.query(
              'UPDATE invitado SET talla_playera = $1, updated_at = NOW() WHERE id_invitado = $2',
              [tallaPayload, usuarioId],
            );
          } else {
            await client.query(
              'UPDATE miembro SET talla_playera = COALESCE(talla_playera, $1) WHERE id_miembro = $2',
              [tallaPayload, usuarioId],
            );
          }
        }
      }

      // 3. Mismos datos que exige el formulario público: si el evento entrega
      //    playera/kit, nadie queda inscrito sin talla en su ficha.
      if (evento.solicitar_talla) {
        const tabla = col === 'id_miembro' ? 'miembro' : 'invitado';
        const tallaRes = await client.query(
          `SELECT talla_playera FROM ${tabla} WHERE ${col} = $1`,
          [usuarioId],
        );
        if (!tallaRes.rows[0]?.talla_playera) {
          throw new ValidationError('Este evento pide talla de playera y la persona no tiene una guardada: selecciónala para completar el registro.');
        }
      }

      // 4. Duplicados también contra EQUIPOS: la persona puede no tener
      //    inscripción directa pero ya ocupar un lugar como integrante, y el
      //    filtro del modal sólo ve el correo del capitán en filas de equipo.
      const enEquipo = await client.query(
        `SELECT 1
           FROM inscripcion_evento ie
           JOIN integrante_equipo int_eq ON ie.id_equipo = int_eq.id_equipo
          WHERE ie.id_evento = $1 AND ie.estado <> 'cancelada'
            AND int_eq.${col} = $2
          LIMIT 1`,
        [eventoId, usuarioId],
      );
      if (enEquipo.rows.length > 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Esta persona ya está inscrita en el evento como integrante de un equipo.', code: 'ALREADY_REGISTERED' },
          { status: 409 },
        );
      }

      // 5. Cupos. El admin puede forzar (forzar=true) por encima del aforo.
      //    La disponibilidad se calcula contra las INSCRIPCIONES REALES, no
      //    contra el contador `cupos_disponibles`.
      if (!forzar) {
        const disponibilidad = await verificarDisponibilidad(client, eventoId, evento.cupos);
        if (!disponibilidad.cabe) {
          await client.query('ROLLBACK');
          return NextResponse.json({ error: 'El evento ya no tiene cupos disponibles' }, { status: 400 });
        }
      }

      // 6. Insertar inscripción (el UNIQUE protege duplicados: 23505). Si hay
      //    una inscripción previa (activa o cancelada) se decide la acción.
      const existing = await client.query(
        `SELECT id_inscripcion, estado FROM inscripcion_evento
          WHERE id_evento = $1 AND ${col} = $2`,
        [eventoId, usuarioId],
      );

      // NOTA: los cupos NO se ajustan aquí. Al final de la transacción,
      // `recalcularCupos` deriva `cupos_disponibles` de las inscripciones reales
      // y pisa lo que haya hecho el trigger de la base. Ver src/lib/eventos-cupos.js.
      if (existing.rows.length === 0) {
        const ins = await client.query(
          `INSERT INTO inscripcion_evento (id_evento, ${col}, id_reto, fecha_inscripcion, estado, requiere_pago, pago_completado)
           VALUES ($1, $2, $6, NOW(), $3, $4, $5) RETURNING id_inscripcion`,
          [eventoId, usuarioId, estadoInicial, requierePago, pago, reto.idReto],
        );
        inscripcionId = ins.rows[0].id_inscripcion;
      } else if (existing.rows[0].estado === 'cancelada') {
        // Reactivar una inscripción cancelada (la mesa anterior ya no vale).
        inscripcionId = existing.rows[0].id_inscripcion;
        await client.query(
          `UPDATE inscripcion_evento
              SET estado = $3, fecha_inscripcion = NOW(),
                  requiere_pago = $4, pago_completado = $2, id_reto = $5, mesa = NULL, updated_at = NOW()
            WHERE id_inscripcion = $1`,
          [inscripcionId, pago, estadoInicial, requierePago, reto.idReto],
        );
      } else {
        // Ya está inscrito y activo.
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'El usuario ya está registrado en este evento', code: 'ALREADY_REGISTERED' },
          { status: 409 },
        );
      }
    }

    // 7. Reconciliación del aforo. Si el admin forzó por encima del cupo, se
    //    sube también `cupos` para que el número deje de mentir: antes el
    //    trigger no descontaba al forzar (sólo lo hacía con cupos_disponibles>0)
    //    pero sí devolvía +1 sin tope al cancelar, y el evento acababa con cupos
    //    fantasma que volvían a admitir gente que no cabía.
    //    OJO: si el aforo lo dictan los desafíos, `recalcularCupos` lo vuelve a
    //    derivar de ellos y el forzado queda como sobrecupo (disponibles = 0).
    let cupos = await recalcularCupos(client, eventoId);
    if (forzar && cupos.cupo_por_retos == null && cupos.cupos !== null && cupos.lugares_ocupados > Number(cupos.cupos)) {
      await client.query('UPDATE evento SET cupos = $2, updated_at = NOW() WHERE id_evento = $1', [eventoId, cupos.lugares_ocupados]);
      cupos = await recalcularCupos(client, eventoId);
    }

    const qrToken = firmarQrToken({ id: inscripcionId, eid: eventoId, ts: Date.now() }, payloadSecret);

    await client.query('COMMIT');

    // Correo con el ticket, ya con la inscripción confirmada en la base. Un
    // fallo del SMTP no deshace el registro: se informa y el admin puede
    // reenviarlo desde la lista.
    let correo = { ok: false, enviados: 0, fallidos: 0, destinatarios: 0, motivo: 'no solicitado' };
    if (enviarCorreo) {
      try {
        correo = await enviarConfirmacionEvento({ inscripcionId, eventoId, qrToken });
      } catch (error) {
        console.error('Admin register: no se pudo enviar la confirmación:', error.message);
        correo = { ok: false, enviados: 0, fallidos: 1, destinatarios: 0, motivo: error.message };
      }
    }

    return NextResponse.json({
      message: tipo_usuario === 'equipo' ? 'Equipo registrado exitosamente' : 'Usuario registrado exitosamente',
      id_inscripcion: inscripcionId,
      estado_inscripcion: estadoInicial,
      requiere_pago: requierePago,
      id_reto: reto.idReto,
      qrToken,
      correo,
      lugares_ocupados: cupos.lugares_ocupados,
      cupos: cupos.cupos,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}

    // Reglas de negocio: el mensaje redactado es para el admin, no un 500.
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('Admin register error:', error);
    if (error.code === '23505') {
      const mensaje = String(error.constraint || '').includes('equipo')
        ? 'Ya existe un equipo con ese nombre en este concurso.'
        : 'El usuario ya está registrado en este evento';
      return NextResponse.json({ error: mensaje, code: 'ALREADY_REGISTERED' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al registrar' }, { status: 500 });
  } finally {
    client.release();
  }
}
