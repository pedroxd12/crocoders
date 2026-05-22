import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    client = await pool.connect();

    const [tiposRes, alcancesRes, plataformasRes, rolesRes] = await Promise.all([
      client.query('SELECT id_tipo_evento, nombre, permite_equipos FROM catalogo_tipo_evento ORDER BY nombre'),
      client.query('SELECT id_alcance, nombre FROM catalogo_alcance_evento ORDER BY nombre'),
      client.query('SELECT id_plataforma, nombre FROM catalogo_plataforma ORDER BY nombre'),
      client.query('SELECT id_rol, nombre, permisos FROM catalogo_rol_staff ORDER BY nombre'),
    ]);

    return NextResponse.json({
      tipos: tiposRes.rows,
      alcances: alcancesRes.rows,
      plataformas: plataformasRes.rows,
      roles: rolesRes.rows,
    });
  } catch (error) {
    console.error('Error fetching catalogs:', error);
    return NextResponse.json({ error: 'Error al obtener catálogos' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
