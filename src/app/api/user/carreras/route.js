import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';

/**
 * Catálogo de carreras para el formulario de perfil.
 *
 * Existía una lista de carreras escrita a mano en /dashboard y otra en
 * /admin/perfil, y ambas diferían de la de /iniciar en los acentos
 * ("Ingeniería en Electronica" vs "Ingeniería en Electrónica"). Como el
 * guardado buscaba la carrera por nombre con ILIKE —que ignora mayúsculas pero
 * NO acentos— nunca encontraba la fila: la carrera no cambiaba y aun así el
 * usuario veía "Perfil actualizado correctamente".
 *
 * La única forma de que eso no vuelva a ocurrir es que el desplegable se
 * alimente de la misma tabla contra la que se guarda, y que se envíe el
 * id_carrera en vez del nombre.
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  let client;
  try {
    client = await connectWithRetry();
    const result = await client.query(
      `SELECT id_carrera, nombre
         FROM catalogo_carrera
        WHERE activo IS NOT FALSE
        ORDER BY nombre`,
    );
    return NextResponse.json({ success: true, carreras: result.rows });
  } catch (error) {
    console.error('Error al obtener el catálogo de carreras:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener las carreras' },
      { status: 500 },
    );
  } finally {
    if (client) client.release();
  }
}
