// src/app/api/programas/[id]/unregister/route.js
// Cancela (lógicamente) la inscripción del miembro autenticado a un programa.
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';

export async function POST(request, { params }) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const memberId = Number(auth.session.id);

  const { id } = await params;
  const programaId = Number(id);
  if (!Number.isInteger(programaId) || programaId <= 0) {
    return NextResponse.json({ success: false, error: 'ID de programa inválido' }, { status: 400 });
  }

  try {
    const res = await sql`
      UPDATE inscripcion_programa
         SET estado = 'cancelada', updated_at = NOW()
       WHERE id_programa = ${programaId} AND id_miembro = ${memberId} AND estado <> 'cancelada'
       RETURNING id_inscripcion_programa
    `;
    if (res.length === 0) {
      return NextResponse.json({ success: false, error: 'No se encontró una inscripción activa para cancelar' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Inscripción al programa cancelada' });
  } catch (error) {
    console.error('Error al cancelar inscripción a programa:', error);
    return NextResponse.json({ success: false, error: 'Error al cancelar la inscripción' }, { status: 500 });
  }
}
