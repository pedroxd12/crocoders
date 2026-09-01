import { NextResponse } from 'next/server';
import { query } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

// Catálogos: cuatro tablas pequeñas y prácticamente inmutables que casi todas
// las pantallas del panel piden al montar. Antes se leían en serie sobre un
// mismo client (el tiempo era la suma de las cuatro) y sin ninguna cabecera de
// caché, así que cada navegación las volvía a pedir enteras.
export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const [tiposRes, alcancesRes, plataformasRes, rolesRes] = await Promise.all([
      query('SELECT id_tipo_evento, nombre, permite_equipos FROM catalogo_tipo_evento ORDER BY nombre'),
      query('SELECT id_alcance, nombre FROM catalogo_alcance_evento ORDER BY nombre'),
      query('SELECT id_plataforma, nombre FROM catalogo_plataforma ORDER BY nombre'),
      query('SELECT id_rol, nombre, puede_administrar, puede_editar, puede_ver FROM catalogo_rol_staff ORDER BY nombre'),
    ]);

    return NextResponse.json(
      {
        tipos: tiposRes.rows,
        alcances: alcancesRes.rows,
        plataformas: plataformasRes.rows,
        roles: rolesRes.rows,
      },
      {
        headers: {
          // `private`: la respuesta va detrás de requireAdmin, no debe tocarla
          // ninguna CDN compartida. Un minuto de caché de navegador convierte
          // en instantáneo el segundo montaje de cualquier formulario del panel.
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('Error fetching catalogs:', error);
    return NextResponse.json({ error: 'Error al obtener catálogos' }, { status: 500 });
  }
}
