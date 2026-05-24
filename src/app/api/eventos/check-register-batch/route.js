// src/app/api/eventos/check-register-batch/route.js
// Devuelve, en una sola llamada, el conjunto de eventos a los que un usuario está inscrito.
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { checkRegisterBatchSchema, parseOrError } from '@/lib/validation';
import { requireAuth } from '@/lib/auth';

export async function POST(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = Number(auth.session.id);

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const [data, errPayload] = parseOrError(checkRegisterBatchSchema, body);
  if (errPayload) {
    return NextResponse.json(errPayload, { status: 400 });
  }
  const { eventIds } = data;

  try {
    const registros = await sql`
      SELECT DISTINCT ie.id_evento
      FROM inscripcion_evento ie
      WHERE ie.id_miembro = ${userId}
        AND ie.id_evento = ANY(${eventIds}::int[])
        AND ie.estado <> 'cancelada'

      UNION

      SELECT DISTINCT ie.id_evento
      FROM inscripcion_evento ie
      INNER JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
      INNER JOIN integrante_equipo int_eq ON eq.id_equipo = int_eq.id_equipo
      WHERE int_eq.id_miembro = ${userId}
        AND ie.id_evento = ANY(${eventIds}::int[])
        AND ie.estado <> 'cancelada'
    `;

    const registeredMap = {};
    for (const id of eventIds) registeredMap[id] = false;
    for (const row of registros) registeredMap[row.id_evento] = true;

    return NextResponse.json({ registered: registeredMap });
  } catch (error) {
    console.error('[API check-register-batch] Error:', error);
    return NextResponse.json({ error: 'Error al verificar inscripciones' }, { status: 500 });
  }
}
