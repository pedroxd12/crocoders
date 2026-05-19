import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const client = await pool.connect();
  
  try {
    // Obtener miembros - concatenar nombre completo desde columnas separadas
    const miembrosResult = await client.query(`
      SELECT 
        id_miembro as id,
        nombre || ' ' || apellido_paterno || ' ' || COALESCE(apellido_materno, '') as nombre_completo,
        correo_electronico as email,
        'miembro' as tipo
      FROM miembro
      WHERE deleted_at IS NULL
      ORDER BY nombre, apellido_paterno
    `);

    // Obtener invitados - ya tiene nombre_completo como columna única
    const invitadosResult = await client.query(`
      SELECT 
        id_invitado as id,
        nombre_completo,
        correo_electronico as email,
        'invitado' as tipo
      FROM invitado
      ORDER BY nombre_completo
    `);

    return NextResponse.json([...miembrosResult.rows, ...invitadosResult.rows]);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Error al obtener usuarios' }, 
      { status: 500 }
    );
  } finally {
    client.release();
  }
}