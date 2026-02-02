import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

export async function GET(request, { params }) {
  const { id } = await params;
  const client = await pool.connect();

  try {
    const query = `
      SELECT 
        ie.id_inscripcion, 
        ie.estado, 
        ie.asistio, 
        ie.pago_completado,
        ie.requiere_pago,
        ie.fecha_inscripcion,
        CASE 
            WHEN m.id_miembro IS NOT NULL THEN CONCAT(m.nombre, ' ', m.apellido_paterno, ' ', COALESCE(m.apellido_materno, '')) 
            WHEN i.id_invitado IS NOT NULL THEN i.nombre_completo 
        END as nombre_completo,
        CASE 
            WHEN m.id_miembro IS NOT NULL THEN m.correo_electronico 
            WHEN i.id_invitado IS NOT NULL THEN i.correo_electronico 
        END as correo,
        CASE 
            WHEN m.id_miembro IS NOT NULL THEN 'Miembro' 
            WHEN i.id_invitado IS NOT NULL THEN 'Invitado' 
        END as tipo_usuario,
        m.numero_ieee,
        e.nombre as nombre_evento,
        e.fecha_inicio
      FROM inscripcion_evento ie
      LEFT JOIN miembro m ON ie.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ie.id_invitado = i.id_invitado
      JOIN evento e ON ie.id_evento = e.id_evento
      WHERE ie.id_evento = $1
      ORDER BY ie.fecha_inscripcion DESC
    `;
    
    // Check if event exists first or just return empty
    const result = await client.query(query, [id]);
    
    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('Error fetching asistentes:', error);
    return NextResponse.json(
      { error: 'Error al obtener asistentes' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
