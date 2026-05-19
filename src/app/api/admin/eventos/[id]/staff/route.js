
import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const client = await pool.connect();

  try {
    // Check if event exists
    const eventCheck = await client.query('SELECT nombre FROM evento WHERE id_evento = $1', [id]);
    if (eventCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    const query = `
      SELECT 
        s.id_staff,
        s.id_evento,
        s.id_miembro,
        s.id_rol,
        m.nombre || ' ' || m.apellido_paterno || ' ' || COALESCE(m.apellido_materno, '') as nombre_completo,
        m.correo_electronico,
        r.nombre as rol_nombre
      FROM staff_evento s
      JOIN miembro m ON s.id_miembro = m.id_miembro
      JOIN catalogo_rol_staff r ON s.id_rol = r.id_rol
      WHERE s.id_evento = $1
      ORDER BY r.nombre, m.nombre
    `;
    
    const result = await client.query(query, [id]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching staff:', error);
    return NextResponse.json({ error: 'Error al obtener el staff' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const { id } = await params; // id_evento
    const { id_miembro, id_rol } = await request.json();

    if (!id_miembro || !id_rol) {
        return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
        const query = `
            INSERT INTO staff_evento (id_evento, id_miembro, id_rol)
            VALUES ($1, $2, $3)
            RETURNING id_staff
        `;
        const result = await client.query(query, [id, id_miembro, id_rol]);
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error('Error adding staff:', error);
        if (error.code === '23505') { // Unique violation
            return NextResponse.json({ error: 'El miembro ya es parte del staff' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Error al agregar staff' }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function DELETE(request, { params }) {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const { searchParams } = new URL(request.url);
    const idStaff = searchParams.get('id_staff');

    if (!idStaff) {
         return NextResponse.json({ error: 'ID Staff requerido' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
        await client.query('DELETE FROM staff_evento WHERE id_staff = $1', [idStaff]);
        return NextResponse.json({ message: 'Staff eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting staff:', error);
         return NextResponse.json({ error: 'Error al eliminar staff' }, { status: 500 });
    } finally {
        client.release();
    }
}
