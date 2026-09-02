import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { listarAsistentesEvento } from '@/lib/eventos-asistentes';

// GET - Inscritos del evento para el panel de staff.
// Gate: autenticado; abajo se exige pertenencia a staff_evento de ESTE evento
// (403). Cualquier rol asignado puede VER la lista (src/lib/roles-staff.js);
// lo que cambia por rol es qué puede marcar, y eso lo deciden los endpoints
// de escritura.
//
// La consulta es la MISMA del panel de administración
// (src/lib/eventos-asistentes.js): antes el staff no veía talla, playera ni
// quiénes integran cada equipo.
export async function GET(request, { params }) {
  const guard = await requireAuth(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    const staffCheck = await client.query(
      'SELECT id_staff FROM staff_evento WHERE id_evento = $1 AND id_miembro = $2',
      [id, guard.session.id],
    );
    if (staffCheck.rows.length === 0) {
      return NextResponse.json({ error: 'No tienes permisos para este evento' }, { status: 403 });
    }

    const filas = await listarAsistentesEvento(client, id);
    return NextResponse.json(filas);
  } catch (error) {
    console.error('Error fetching asistentes:', error);
    return NextResponse.json({ error: 'Error al obtener asistentes' }, { status: 500 });
  } finally {
    client.release();
  }
}
