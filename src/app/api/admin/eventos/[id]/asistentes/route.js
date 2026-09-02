import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { listarAsistentesEvento } from '@/lib/eventos-asistentes';

// GET - Inscritos del evento para el panel de administración.
// La consulta es la MISMA que usa el panel de staff (src/lib/eventos-asistentes.js):
// persona o equipo por fila, con talla, playera, perfil, desafío, comprobante y,
// en equipos, el roster completo en `equipo`.
export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  let client;
  try {
    client = await connectWithRetry();
    const filas = await listarAsistentesEvento(client, id);
    return NextResponse.json(filas);
  } catch (error) {
    console.error('Error fetching asistentes:', error);
    return NextResponse.json({ error: 'Error al obtener asistentes' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
