import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import {
  ROLES_VALIDOS,
  motivoBloqueoUltimoAdmin,
  normalizarRolConStaff,
} from '@/lib/admin-guard';

// Único endpoint de cambio de rol del panel. Antes convivía con la rama `rol`
// del PUT de /api/admin/miembros, cada uno con reglas distintas: uno protegía
// al último administrador y el otro no, según por qué pantalla entraras.
export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ error: 'ID de miembro inválido' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const rolSolicitado = body.rol ?? body.tipo;

  if (!ROLES_VALIDOS.has(rolSolicitado)) {
    return NextResponse.json(
      { error: 'Rol no válido. Use "administrador", "staff" o "usuario"' },
      { status: 400 },
    );
  }

  let client;
  try {
    // Transacción: el conteo de administradores y el UPDATE tienen que ver la
    // misma foto. Con el helper `sql` (sin transacción ni FOR UPDATE) dos
    // peticiones simultáneas podían degradar a los dos últimos administradores.
    client = await connectWithRetry();
    await client.query('BEGIN');

    const actualRes = await client.query(
      'SELECT rol, estado FROM miembro WHERE id_miembro = $1 FOR UPDATE',
      [idNum],
    );

    if (actualRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });
    }

    const bloqueo = await motivoBloqueoUltimoAdmin(client, actualRes.rows[0], { rol: rolSolicitado });
    if (bloqueo) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: bloqueo }, { status: 400 });
    }

    const rolEfectivo = await normalizarRolConStaff(client, idNum, rolSolicitado);

    const updateRes = await client.query(
      `UPDATE miembro
          SET rol = $1, updated_at = NOW()
        WHERE id_miembro = $2
       RETURNING id_miembro, nombre, apellido_paterno, apellido_materno,
                 correo_electronico, rol, estado`,
      [rolEfectivo, idNum],
    );

    await client.query('COMMIT');

    const updated = updateRes.rows[0];
    const nombre_completo =
      `${updated.nombre} ${updated.apellido_paterno} ${updated.apellido_materno || ''}`.trim();

    return NextResponse.json({
      id_miembro: updated.id_miembro,
      nombre_completo,
      correo_electronico: updated.correo_electronico,
      rol: updated.rol,
      estado: updated.estado,
      // El cliente avisa cuando el rol guardado no es el pedido (sigue siendo
      // staff de algún evento), en vez de mostrar en pantalla algo que la base
      // de datos no tiene.
      ajustado: updated.rol !== rolSolicitado,
    });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    console.error('Error en PUT /api/admin/miembros/[id]/rol:', error);
    return NextResponse.json({ error: 'Error al actualizar el rol' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
