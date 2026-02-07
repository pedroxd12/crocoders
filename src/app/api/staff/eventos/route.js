import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { verifyToken } from '@/lib/auth';

// GET - Obtener eventos donde el usuario es staff
export async function GET(request) {
  const client = await pool.connect();
  
  try {
    // Verificar token y obtener usuario
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded || !decoded.id) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const id_miembro = decoded.id;

    const result = await client.query(
      `SELECT 
        e.id_evento,
        e.nombre,
        e.descripcion,
        e.fecha_inicio,
        e.hora_inicio,
        e.fecha_fin,
        e.hora_fin,
        e.ubicacion,
        e.imagen_url,
        te.nombre as tipo_evento,
        ae.nombre as alcance,
        r.nombre as mi_rol,
        r.id_rol,
        COUNT(DISTINCT ie.id_inscripcion) as total_inscritos,
        COUNT(DISTINCT CASE WHEN ie.asistio = true THEN ie.id_inscripcion END) as total_asistieron
      FROM staff_evento se
      JOIN evento e ON se.id_evento = e.id_evento
      JOIN catalogo_rol_staff r ON se.id_rol = r.id_rol
      LEFT JOIN catalogo_tipo_evento te ON e.id_tipo_evento = te.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento ae ON e.id_alcance = ae.id_alcance
      LEFT JOIN inscripcion_evento ie ON e.id_evento = ie.id_evento
      WHERE se.id_miembro = $1
      GROUP BY e.id_evento, te.nombre, ae.nombre, r.nombre, r.id_rol
      ORDER BY e.fecha_inicio DESC`,
      [id_miembro]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching staff eventos:', error);
    return NextResponse.json(
      { error: 'Error al obtener eventos' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
