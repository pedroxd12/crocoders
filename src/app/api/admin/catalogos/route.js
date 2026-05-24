import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    client = await pool.connect();

    // Un solo client no admite queries concurrentes reales; se ejecutan en serie.
    const tiposRes = await client.query('SELECT id_tipo_evento, nombre, permite_equipos FROM catalogo_tipo_evento ORDER BY nombre');
    const alcancesRes = await client.query('SELECT id_alcance, nombre FROM catalogo_alcance_evento ORDER BY nombre');
    const plataformasRes = await client.query('SELECT id_plataforma, nombre FROM catalogo_plataforma ORDER BY nombre');
    const rolesRes = await client.query('SELECT id_rol, nombre, puede_administrar, puede_editar, puede_ver FROM catalogo_rol_staff ORDER BY nombre');

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
