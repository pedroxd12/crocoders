import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { recalcularCupos, verificarDisponibilidad } from '@/lib/eventos-cupos';

// POST: un administrador inscribe a un miembro o invitado existente en un evento.
// (El registro por equipos se realiza desde el flujo público /api/eventos/register.)
export async function POST(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  const { id_evento, id_usuario, tipo_usuario, forzar, pago_completado } = body;

  const eventoId = Number(id_evento);
  const usuarioId = Number(id_usuario);

  if (!Number.isInteger(eventoId) || eventoId <= 0 ||
      !Number.isInteger(usuarioId) || usuarioId <= 0) {
    return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
  }
  if (tipo_usuario !== 'miembro' && tipo_usuario !== 'invitado') {
    return NextResponse.json({ error: "tipo_usuario debe ser 'miembro' o 'invitado'" }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    await client.query('BEGIN');

    // 1. Bloquear la fila del evento para descontar cupos de forma atómica.
    const eventRes = await client.query(
      'SELECT cupos, cupos_disponibles, tiene_costo FROM evento WHERE id_evento = $1 FOR UPDATE',
      [eventoId],
    );

    if (eventRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    const evento = eventRes.rows[0];

    // 2. Verificar que el usuario objetivo exista (FK clara en vez de 23503 -> 500).
    const targetTable = tipo_usuario === 'miembro' ? 'miembro' : 'invitado';
    const targetId = tipo_usuario === 'miembro' ? 'id_miembro' : 'id_invitado';
    const userRes = await client.query(
      `SELECT 1 FROM ${targetTable} WHERE ${targetId} = $1`,
      [usuarioId],
    );
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: tipo_usuario === 'miembro' ? 'Miembro no encontrado' : 'Invitado no encontrado' },
        { status: 404 },
      );
    }

    // 3. Cupos. El admin puede forzar (forzar=true) por encima del aforo.
    //    La disponibilidad se calcula contra las INSCRIPCIONES REALES, no contra
    //    el contador `cupos_disponibles`: éste podía venir desfasado y, además,
    //    `null <= 0` daba true, así que los eventos de aforo ilimitado
    //    (cupos IS NULL) rechazaban cualquier alta.
    if (!forzar) {
      const disponibilidad = await verificarDisponibilidad(client, eventoId, evento.cupos, 1);
      if (!disponibilidad.cabe) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'El evento ya no tiene cupos disponibles' }, { status: 400 });
      }
    }

    // 4. Insertar inscripción (el UNIQUE parcial protege duplicados: 23505).
    //    Para eventos con costo, el pago lo marca explícitamente el admin.
    const col = tipo_usuario === 'miembro' ? 'id_miembro' : 'id_invitado';
    const pago = evento.tiene_costo ? Boolean(pago_completado) : false;
    // Coherencia con el registro público: en un evento con costo la inscripción
    // sólo nace 'confirmada' si el admin marca el pago; si no, queda 'pendiente'
    // (el lugar sigue apartado) hasta que registre el cobro.
    const estadoInicial = evento.tiene_costo && !pago ? 'pendiente' : 'confirmada';
    const requierePago = Boolean(evento.tiene_costo);

    // Buscar inscripción existente (activa o cancelada) para decidir la acción.
    const existing = await client.query(
      `SELECT id_inscripcion, estado FROM inscripcion_evento
        WHERE id_evento = $1 AND ${col} = $2`,
      [eventoId, usuarioId],
    );

    let inscripcionId;

    // NOTA: los cupos NO se ajustan aquí. Al final de la transacción,
    // `recalcularCupos` deriva `cupos_disponibles` de las inscripciones reales
    // y pisa lo que haya hecho el trigger de la base. Ver src/lib/eventos-cupos.js.
    if (existing.rows.length === 0) {
      const ins = await client.query(
        `INSERT INTO inscripcion_evento (id_evento, ${col}, fecha_inscripcion, estado, requiere_pago, pago_completado)
         VALUES ($1, $2, NOW(), $3, $4, $5) RETURNING id_inscripcion`,
        [eventoId, usuarioId, estadoInicial, requierePago, pago],
      );
      inscripcionId = ins.rows[0].id_inscripcion;
    } else if (existing.rows[0].estado === 'cancelada') {
      // Reactivar una inscripción cancelada.
      inscripcionId = existing.rows[0].id_inscripcion;
      await client.query(
        `UPDATE inscripcion_evento
            SET estado = $3, fecha_inscripcion = NOW(),
                requiere_pago = $4, pago_completado = $2, updated_at = NOW()
          WHERE id_inscripcion = $1`,
        [inscripcionId, pago, estadoInicial, requierePago],
      );
    } else {
      // Ya está inscrito y activo.
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'El usuario ya está registrado en este evento', code: 'ALREADY_REGISTERED' },
        { status: 409 },
      );
    }

    // 5. Reconciliación del aforo. Si el admin forzó por encima del cupo, se
    //    sube también `cupos` para que el número deje de mentir: antes el
    //    trigger no descontaba al forzar (sólo lo hacía con cupos_disponibles>0)
    //    pero sí devolvía +1 sin tope al cancelar, y el evento acababa con cupos
    //    fantasma que volvían a admitir gente que no cabía.
    const { lugares_ocupados: ocupados } = await recalcularCupos(client, eventoId);
    if (forzar && evento.cupos !== null && ocupados > Number(evento.cupos)) {
      await client.query('UPDATE evento SET cupos = $2, updated_at = NOW() WHERE id_evento = $1', [eventoId, ocupados]);
      await recalcularCupos(client, eventoId);
    }

    await client.query('COMMIT');

    return NextResponse.json({
      message: 'Usuario registrado exitosamente',
      id_inscripcion: inscripcionId,
      estado_inscripcion: estadoInicial,
      requiere_pago: requierePago,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Admin register error:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'El usuario ya está registrado en este evento', code: 'ALREADY_REGISTERED' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Error al registrar usuario' }, { status: 500 });
  } finally {
    client.release();
  }
}
