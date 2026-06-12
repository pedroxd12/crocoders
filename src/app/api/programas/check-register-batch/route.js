// src/app/api/programas/check-register-batch/route.js
// Devuelve, para el miembro autenticado, a qué programas (de una lista) está
// inscrito. Alimenta el estado "Inscrito" en el catálogo público de programas.
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';

export async function POST(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const memberId = Number(auth.session.id);

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const ids = Array.isArray(body?.programaIds)
    ? body.programaIds.map(Number).filter(n => Number.isInteger(n) && n > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ registered: {} });
  }

  try {
    const rows = await sql`
      SELECT DISTINCT id_programa
      FROM inscripcion_programa
      WHERE id_miembro = ${memberId}
        AND id_programa = ANY(${ids}::int[])
        AND estado <> 'cancelada'
    `;
    const registered = {};
    for (const id of ids) registered[id] = false;
    for (const r of rows) registered[r.id_programa] = true;
    return NextResponse.json({ registered });
  } catch (error) {
    console.error('[programas check-register-batch] Error:', error);
    return NextResponse.json({ error: 'Error al verificar inscripciones' }, { status: 500 });
  }
}
