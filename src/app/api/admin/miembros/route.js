import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    client = await pool.connect();
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

export async function PUT(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    client = await pool.connect();
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

  if (!id) {
    return NextResponse.json({ error: 'ID es requerido' }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();
    const userCheck = await client.query('SELECT rol FROM miembro WHERE id_miembro = $1', [id]);
    
    if (userCheck.rows.length === 0) {
       return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const userToDelete = userCheck.rows[0];

    if (userToDelete.rol === 'administrador') {
       const adminCountRes = await client.query("SELECT COUNT(*) FROM miembro WHERE rol = 'administrador' AND estado = 'activo'");
       const adminCount = parseInt(adminCountRes.rows[0].count);
       
       if (adminCount <= 1) {
         return NextResponse.json({ error: 'No se puede eliminar al último administrador del sistema.' }, { status: 400 });
       }
    }

    // Hard delete
    const query = `
      DELETE FROM miembro 
      WHERE id_miembro = $1
      RETURNING id_miembro
    `;
    
    await client.query(query, [id]);

    return NextResponse.json({ success: true, message: 'Miembro y sus datos asociados eliminados correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/admin/miembros:', error);
    return NextResponse.json({ error: 'Error al eliminar miembro' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
