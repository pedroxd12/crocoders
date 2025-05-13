import { NextResponse } from 'next/server';
import sql from '@/lib/db-server';

export async function GET() {
  try {
    // Obtener miembros (ajusta según tu estructura)
    const miembros = await sql`
      SELECT 
        id_miembro as id,
        nombre_completo,
        correo_electronico as email,
        'miembro' as tipo
      FROM miembro
      ORDER BY nombre_completo
    `;

    // Obtener invitados (si es necesario)
    const invitados = await sql`
      SELECT 
        id_invitado as id,
        nombre_completo,
        correo_electronico as email,
        'invitado' as tipo
      FROM invitado
      ORDER BY nombre_completo
    `;

    return NextResponse.json([...miembros, ...invitados]);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      [], 
      { status: 500 }
    );
  }
}