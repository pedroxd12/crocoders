import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import jwt from 'jsonwebtoken';

export async function GET(request) {
  try {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    
    const client = await pool.connect();
    
    try {
        const query = `
          SELECT 
            e.id_evento,
            e.nombre as nombre, -- Alias
            e.fecha_inicio as fecha, -- Alias
            t.nombre as tipo, -- Alias resolving FK
            CASE WHEN ie.id_miembro IS NOT NULL THEN true ELSE false END as participacion
          FROM evento e
          JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
          LEFT JOIN inscripcion_evento ie ON e.id_evento = ie.id_evento AND ie.id_miembro = $1
          ORDER BY e.fecha_inicio DESC
        `;

        const result = await client.query(query, [decoded.id]);
        
        return NextResponse.json(result.rows);
    } finally {
        client.release();
    }
  } catch (error) {
    console.error('Error al obtener eventos:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener los eventos' },
      { status: 500 }
    );
  }
}
