// src/app/api/programas/route.js
// Listado PÚBLICO de programas recurrentes (talleres/cursos) activos, para que
// los usuarios los vean y se inscriban. No requiere auth.
//
// La consulta y el formateo viven en src/lib/programas-listado.js: la página
// /programas los ejecuta ahora en el servidor para mandar el catálogo dentro
// del HTML, y este endpoint queda para las revalidaciones de SWR desde el
// cliente (tras inscribirse o cancelar).
import { NextResponse } from 'next/server';
import { listarProgramasPublicos } from '@/lib/programas-listado';
import { esErrorDeConexion } from '@/lib/eventos-listado';

export async function GET() {
  try {
    return NextResponse.json(await listarProgramasPublicos());
  } catch (error) {
    console.error('Error en GET /api/programas:', error);
    if (esErrorDeConexion(error)) {
      return NextResponse.json(
        { error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Error al obtener programas' }, { status: 500 });
  }
}
