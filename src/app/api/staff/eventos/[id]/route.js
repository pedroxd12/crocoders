import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { verifyToken } from '@/lib/auth';

// GET - Obtener detalles de un evento como staff
export async function GET(request, { params }) {
  const { id } = await params;
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

    // Verificar que el usuario es staff del evento
    const staffCheck = await client.query(
      `SELECT r.nombre as rol, r.id_rol, r.permisos
       FROM staff_evento se
       JOIN catalogo_rol_staff r ON se.id_rol = r.id_rol
       WHERE se.id_evento = $1 AND se.id_miembro = $2`,
      [id, id_miembro]
    );

    if (staffCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'No tienes permisos para este evento' },
        { status: 403 }
      );
    }

    // Obtener detalles del evento
    const eventoResult = await client.query(
      `SELECT 
        e.*,
        te.nombre as tipo_evento,
        ae.nombre as alcance,
        COUNT(DISTINCT ie.id_inscripcion) as total_inscritos,
        COUNT(DISTINCT CASE WHEN ie.asistio = true THEN ie.id_inscripcion END) as total_asistieron,
        COUNT(DISTINCT CASE WHEN ie.pago_completado = true THEN ie.id_inscripcion END) as pagos_completados
      FROM evento e
      LEFT JOIN catalogo_tipo_evento te ON e.id_tipo_evento = te.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento ae ON e.id_alcance = ae.id_alcance
      LEFT JOIN inscripcion_evento ie ON e.id_evento = ie.id_evento
      WHERE e.id_evento = $1
      GROUP BY e.id_evento, te.nombre, ae.nombre`,
      [id]
    );

    if (eventoResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Evento no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      evento: eventoResult.rows[0],
      mi_rol: staffCheck.rows[0]
    });
  } catch (error) {
    console.error('Error fetching evento details:', error);
    return NextResponse.json(
      { error: 'Error al obtener detalles del evento' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
