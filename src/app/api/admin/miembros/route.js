import { NextResponse } from 'next/server';
import pool, { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    client = await connectWithRetry();
    const query = `
      SELECT
        m.id_miembro,
        m.nombre,
        m.apellido_paterno,
        m.apellido_materno,
        m.correo_electronico,
        m.numero_telefono,
        m.semestre_actual,
        m.created_at AS fecha_registro,
        m.periodo_ingreso,
        m.estado, 
        m.rol,
        m.es_club_programacion,
        m.es_computer_society,
        m.numero_ieee,
        cc.nombre as carrera,
        MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.usuario END) as usuario_codeforces,
        MAX(CASE WHEN p.nombre = 'VJudge' THEN cp.usuario END) as usuario_vjudge,
        MAX(CASE WHEN p.nombre = 'OmegaUp' THEN cp.usuario END) as usuario_omegaup
      FROM miembro m
      LEFT JOIN catalogo_carrera cc ON m.id_carrera = cc.id_carrera
      LEFT JOIN cuenta_plataforma cp ON m.id_miembro = cp.id_miembro
      LEFT JOIN catalogo_plataforma p ON cp.id_plataforma = p.id_plataforma
      GROUP BY m.id_miembro, cc.nombre
      ORDER BY m.nombre, m.apellido_paterno
    `;
    
    const result = await client.query(query);
    
    const miembros = result.rows.map(row => ({
      ...row,
      nombre_completo: `${row.nombre} ${row.apellido_paterno} ${row.apellido_materno || ''}`.trim()
    }));

    return NextResponse.json(miembros);
  } catch (error) {
    console.error('Error en GET /api/admin/miembros:', error);
    return NextResponse.json(
      { error: 'Error al obtener la lista de miembros' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}


const ROLES_VALIDOS = new Set(['administrador', 'usuario', 'staff']);
const ESTADOS_VALIDOS = new Set(['activo', 'inactivo', 'baja']);

// POST: promueve a administrador a un miembro existente, identificado por correo.
// Lo usa el modal "Añadir Nuevo Administrador" de /admin/admins.
export async function POST(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    const { correo_electronico } = await request.json().catch(() => ({}));

    const correo = typeof correo_electronico === 'string' ? correo_electronico.trim() : '';
    if (!correo) {
      return NextResponse.json({ error: 'El correo electrónico es requerido' }, { status: 400 });
    }

    client = await connectWithRetry();

    const existing = await client.query(
      `SELECT m.id_miembro, m.nombre, m.apellido_paterno, m.apellido_materno,
              m.correo_electronico, m.rol, cc.nombre AS carrera
         FROM miembro m
         LEFT JOIN catalogo_carrera cc ON m.id_carrera = cc.id_carrera
        WHERE LOWER(m.correo_electronico) = LOWER($1)
        LIMIT 1`,
      [correo],
    );

    if (existing.rowCount === 0) {
      return NextResponse.json(
        { error: 'No existe un miembro registrado con ese correo electrónico' },
        { status: 404 },
      );
    }

    const miembro = existing.rows[0];

    if (miembro.rol === 'administrador') {
      return NextResponse.json(
        { error: 'Este miembro ya es administrador' },
        { status: 409 },
      );
    }

    const updateRes = await client.query(
      `UPDATE miembro
          SET rol = 'administrador', updated_at = NOW()
        WHERE id_miembro = $1
       RETURNING id_miembro, nombre, apellido_paterno, apellido_materno, correo_electronico, rol`,
      [miembro.id_miembro],
    );

    const updated = updateRes.rows[0];
    const nombre_completo = `${updated.nombre} ${updated.apellido_paterno} ${updated.apellido_materno || ''}`.trim();

    return NextResponse.json({
      id_miembro: updated.id_miembro,
      nombre_completo,
      correo_electronico: updated.correo_electronico,
      carrera: miembro.carrera,
      rol: updated.rol,
    });
  } catch (error) {
    console.error('Error en POST /api/admin/miembros:', error);
    return NextResponse.json({ error: 'Error al agregar administrador' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

export async function PUT(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    client = await connectWithRetry();
    const { id_miembro, rol, estado } = await request.json();

    const idNum = Number(id_miembro);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json({ error: 'ID de miembro inválido' }, { status: 400 });
    }
    if (rol !== undefined && !ROLES_VALIDOS.has(rol)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }
    if (estado !== undefined && !ESTADOS_VALIDOS.has(estado)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }

    const checkRes = await client.query('SELECT id_miembro FROM miembro WHERE id_miembro = $1', [idNum]);
    if (checkRes.rowCount === 0) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });
    }

    const updates = [];
    const values = [];
    let queryIdx = 1;

    if (rol) {
      updates.push(`rol = $${queryIdx++}`);
      values.push(rol);
    }

    if (estado) {
      updates.push(`estado = $${queryIdx++}`);
      values.push(estado);

      if (estado === 'baja') {
        updates.push(`deleted_at = NOW()`);
      } else if (estado === 'activo') {
        updates.push(`deleted_at = NULL`);
      }
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length > 1) {
      values.push(idNum);
      const query = `
        UPDATE miembro
        SET ${updates.join(', ')}
        WHERE id_miembro = $${queryIdx}
        RETURNING id_miembro, nombre, apellido_paterno, rol, estado
      `;

      const updateRes = await client.query(query, values);
      return NextResponse.json({ success: true, member: updateRes.rows[0] });
    }

    return NextResponse.json({ success: true, message: 'No data changed' });
  } catch (error) {
    console.error('Error en PUT /api/admin/miembros:', error);
    return NextResponse.json({ error: 'Error al actualizar miembro' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

export async function DELETE(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ error: 'ID de miembro inválido' }, { status: 400 });
  }

  let client;
  try {
    client = await connectWithRetry();
    // Baja LÓGICA en transacción. Un hard delete (a) destruiría por CASCADE todo el
    // historial de inscripciones/asistencias/pagos del miembro y (b) fallaría con
    // 23503 → 500 si el miembro creó evidencias (esa FK no es CASCADE). El soft
    // delete es coherente con el resto del sistema (estado='baja' + deleted_at) y
    // con el toggle de estado del PUT.
    await client.query('BEGIN');

    // Bloquear la fila para evitar TOCTOU con el conteo de administradores.
    const userCheck = await client.query(
      'SELECT rol, estado FROM miembro WHERE id_miembro = $1 FOR UPDATE',
      [idNum],
    );

    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const userToDelete = userCheck.rows[0];

    if (userToDelete.estado === 'baja') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'El miembro ya está dado de baja' }, { status: 409 });
    }

    // No permitir dar de baja al último administrador activo.
    if (userToDelete.rol === 'administrador') {
      const adminCountRes = await client.query(
        "SELECT COUNT(*)::int AS count FROM miembro WHERE rol = 'administrador' AND estado = 'activo'",
      );
      if (adminCountRes.rows[0].count <= 1) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'No se puede eliminar al último administrador del sistema.' },
          { status: 400 },
        );
      }
    }

    await client.query(
      `UPDATE miembro
          SET estado = 'baja', deleted_at = NOW(), updated_at = NOW()
        WHERE id_miembro = $1`,
      [idNum],
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true, message: 'Miembro dado de baja correctamente' });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    console.error('Error en DELETE /api/admin/miembros:', error);
    return NextResponse.json({ error: 'Error al eliminar miembro' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
