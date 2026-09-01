import { NextResponse } from 'next/server';
import { listarEventosPublicos, esErrorDeConexion } from '@/lib/eventos-listado';

// La consulta y el formateo viven en src/lib/eventos-listado.js porque la
// página /eventos los ejecuta AHORA en el servidor, para que la lista viaje ya
// dentro del HTML. Este endpoint sigue existiendo para las revalidaciones de
// SWR desde el cliente (al inscribirse, al volver a la pestaña).
export async function GET() {
  try {
    return NextResponse.json(await listarEventosPublicos());
  } catch (error) {
    console.error('Error en GET /api/eventos:', error);

    // Manejo específico de errores de conexión
    if (esErrorDeConexion(error)) {
      return NextResponse.json(
        { error: 'Error de conexión con la base de datos. Por favor, intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Error al obtener eventos' },
      { status: 500 }
    );
  }
}
