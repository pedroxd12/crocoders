import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

// GET - Reporte de asistencia del programa
export async function GET(request, { params }) {
  const { id } = await params;
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT 
        ip.*,
        COALESCE(m.nombre || ' ' || m.apellido_paterno || ' ' || COALESCE(m.apellido_materno, ''), i.nombre_completo) as nombre_completo,
        COALESCE(m.correo_electronico, i.correo_electronico) as email,
        COALESCE(m.numero_telefono, i.numero_telefono) as telefono,
        CASE 
          WHEN ip.id_miembro IS NOT NULL THEN 'miembro'
          ELSE 'invitado'
        END as tipo
      FROM inscripcion_programa ip
      LEFT JOIN miembro m ON ip.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ip.id_invitado = i.id_invitado
      WHERE ip.id_programa = $1
      ORDER BY ip.porcentaje_asistencia DESC, nombre_completo`,
      [id]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching asistencia:', error);
    return NextResponse.json(
      { error: 'Error al obtener reporte de asistencia' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
