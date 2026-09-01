// POST /api/admin/eventos/[id]/recalcular-cupos
//
// Reconciliación manual del aforo de un evento. Existe porque `cupos_disponibles`
// es un contador denormalizado que llegó a divergir de la realidad (evento con
// 150 cupos, 147 "disponibles" y UNA sola inscripción) y hasta ahora no había
// forma de repararlo: el panel sólo recalculaba al cambiar el número de cupos.
//
// La fuente de verdad son las inscripciones reales, contando los integrantes de
// cada equipo. Ver src/lib/eventos-cupos.js.
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { recalcularCupos } from '@/lib/eventos-cupos';

export async function POST(request, context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  let client;
  try {
    client = await connectWithRetry();
    await client.query('BEGIN');

    // Bloquear el evento para que un registro simultáneo no se pierda entre el
    // conteo y la escritura.
    const eventoRes = await client.query(
      'SELECT id_evento, cupos, cupos_disponibles FROM evento WHERE id_evento = $1 AND deleted_at IS NULL FOR UPDATE',
      [id],
    );
    if (eventoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    const anterior = eventoRes.rows[0].cupos_disponibles;
    const resultado = await recalcularCupos(client, id);

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: anterior === resultado.cupos_disponibles
        ? 'El aforo ya estaba al día.'
        : `Aforo corregido: de ${anterior} a ${resultado.cupos_disponibles} lugares disponibles.`,
      cupos: resultado.cupos,
      cupos_disponibles: resultado.cupos_disponibles,
      lugares_ocupados: resultado.lugares_ocupados,
      cupos_disponibles_anterior: anterior,
    });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* transacción ya cerrada */ }
    }
    console.error('Error en POST /api/admin/eventos/[id]/recalcular-cupos:', error);
    return NextResponse.json({ error: 'Error al recalcular los cupos del evento' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
