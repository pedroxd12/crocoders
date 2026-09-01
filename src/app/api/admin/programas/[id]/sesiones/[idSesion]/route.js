import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { recalcularEstadisticasPrograma } from '@/lib/programas-db';

// DELETE - Eliminar sesión del programa
export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id, idSesion } = await params;
  // Misma guarda que la ruta hermana de asistencia: sin ella, un id no numérico
  // llegaba a Postgres (error 22P02) y se respondía 500 en vez de 400.
  if (isNaN(Number(id)) || isNaN(Number(idSesion))) {
    return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
  }
  const client = await connectWithRetry();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      'DELETE FROM sesion_programa WHERE id_sesion = $1 AND id_programa = $2 RETURNING id_sesion',
      [idSesion, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Sesión no encontrada' },
        { status: 404 }
      );
    }

    // Al borrar una sesión cambia el denominador de sesiones obligatorias, pero
    // los triggers de estadísticas cuelgan de asistencia_miembro/asistencia_invitado
    // y no se disparan aquí (y aunque lo hicieran por el cascade, la sesión ya no
    // existe y la función sale sin tocar nada). Se recalcula a mano.
    await recalcularEstadisticasPrograma(client, id);

    await client.query('COMMIT');

    return NextResponse.json({ message: 'Sesión eliminada correctamente' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error deleting sesion:', error);
    return NextResponse.json(
      { error: 'Error al eliminar sesión' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
