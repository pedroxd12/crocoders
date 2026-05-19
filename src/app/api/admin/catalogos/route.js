import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const client = await pool.connect();
  try {
    const tiposQuery = 'SELECT * FROM catalogo_tipo_evento WHERE activo = true ORDER BY nombre';
    const alcancesQuery = 'SELECT * FROM catalogo_alcance_evento ORDER BY orden';
    const plataformasQuery = 'SELECT * FROM catalogo_plataforma WHERE activo = true ORDER BY nombre';
    const rolesQuery = 'SELECT * FROM catalogo_rol_staff ORDER BY nombre';

    const [tiposRes, alcancesRes, plataformasRes, rolesRes] = await Promise.all([
      client.query(tiposQuery),
      client.query(alcancesQuery),
      client.query(plataformasQuery),
      client.query(rolesQuery)
    ]);

    return NextResponse.json({
      tipos: tiposRes.rows,
      alcances: alcancesRes.rows,
      plataformas: plataformasRes.rows,
      roles: rolesRes.rows
    });
  } catch (error) {
    console.error('Error fetching catalogs:', error);
    return NextResponse.json(
      { error: 'Error al obtener catálogos' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
