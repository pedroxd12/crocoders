import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

export async function GET() {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        m.id_miembro,
        m.nombre, 
        m.apellido_paterno,
        m.correo_electronico,
        m.numero_telefono,
        'usuario' as tipo, -- Schema actual no tiene rol
        MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.usuario END) as usuario_codeforces,
        MAX(CASE WHEN p.nombre = 'VJudge' THEN cp.usuario END) as usuario_vjudge,
        MAX(CASE WHEN p.nombre = 'OmegaUp' THEN cp.usuario END) as usuario_omegaup
      FROM miembro m
      LEFT JOIN cuenta_plataforma cp ON m.id_miembro = cp.id_miembro
      LEFT JOIN catalogo_plataforma p ON cp.id_plataforma = p.id_plataforma
      GROUP BY m.id_miembro
      ORDER BY m.nombre
    `;
    
    const result = await client.query(query);
    
    const miembros = result.rows.map(row => ({
      ...row,
      nombre_completo: `${row.nombre} ${row.apellido_paterno}`.trim()
    }));

    return NextResponse.json(miembros);
  } catch (error) {
    console.error('Error en GET /api/admin/miembros:', error);
    return NextResponse.json(
      { error: 'Error al obtener la lista de miembros' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST(request) {
  // Antes se usaba para hacer admin a un usuario.
  // Con el nuevo esquema no hay columna 'rol' o 'tipo' en miembro.
  return NextResponse.json(
    { error: 'La gestión de roles de administrador no está soportada por el esquema de base de datos actual.' },
    { status: 400 }
  );
}

export async function DELETE(request) {
    // Implementar si es necesario, borrado logico cambio de estado
    return NextResponse.json(
        { error: 'No implementado' },
        { status: 501 }
    );
}
