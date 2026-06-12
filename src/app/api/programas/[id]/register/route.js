// src/app/api/programas/[id]/register/route.js
// Inscripción PÚBLICA a un programa recurrente. Igual que eventos: miembro (con
// sesión) o invitado (id_invitado creado vía /api/invitados). Los programas no
// tienen cupos ni QR (la asistencia se toma por sesión, no por ticket de acceso).
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { getSession } from '@/lib/auth';
import { programaRegisterSchema, parseOrError } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request, { params }) {
  // Inscripción mayormente pública (invitados sin cuenta): limitar por IP.
  const rl = rateLimit(request, { scope: 'programa-register', limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos de inscripción. Intenta de nuevo más tarde.' },
      { status: 429 },
    );
  }

  const { id } = await params;
  const programaIdFromUrl = Number(id);

  const session = await getSession(request);
  const memberId = session ? Number(session.id) : null;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }
  // El programaId del body debe coincidir con el de la URL (defensa).
  payload = { ...payload, programaId: payload.programaId ?? programaIdFromUrl };

  const [data, errPayload] = parseOrError(programaRegisterSchema, payload);
  if (errPayload) return NextResponse.json(errPayload, { status: 400 });

  const { tipo, programaId } = data;
  if (tipo === 'miembro' && !memberId) {
    return NextResponse.json({ success: false, error: 'Debes iniciar sesión para inscribirte como miembro.' }, { status: 401 });
  }
  if (tipo === 'invitado' && memberId) {
    return NextResponse.json({ success: false, error: 'Ya tienes sesión iniciada; inscríbete como miembro.' }, { status: 400 });
  }
  const guestId = tipo === 'invitado' ? Number(data.userId) : null;

  try {
    // El programa debe existir y estar activo.
    const prog = await sql`SELECT id_programa, nombre, activo FROM programa_recurrente WHERE id_programa = ${programaId}`;
    if (prog.length === 0) {
      return NextResponse.json({ success: false, error: 'Programa no encontrado' }, { status: 404 });
    }
    if (!prog[0].activo) {
      return NextResponse.json({ success: false, error: 'Este programa no está disponible para inscripciones.' }, { status: 400 });
    }

    if (memberId) {
      // Reactivar si estaba cancelada (ON CONFLICT por el UNIQUE de miembro).
      const ins = await sql`
        INSERT INTO inscripcion_programa (id_programa, id_miembro, estado, fecha_inscripcion)
        VALUES (${programaId}, ${memberId}, 'activo', NOW())
        ON CONFLICT ON CONSTRAINT inscripcion_programa_id_programa_id_miembro_key
        DO UPDATE SET estado = 'activo', updated_at = NOW()
        RETURNING id_inscripcion_programa, estado, (xmax = 0) AS insertada
      `;
      return NextResponse.json({ success: true, message: 'Inscripción al programa exitosa', id_inscripcion: ins[0].id_inscripcion_programa });
    } else {
      // Invitado: verificar que exista para un 404 claro.
      const inv = await sql`SELECT 1 FROM invitado WHERE id_invitado = ${guestId}`;
      if (inv.length === 0) {
        return NextResponse.json({ success: false, error: 'Invitado no encontrado. Vuelve a completar tus datos.' }, { status: 404 });
      }
      const ins = await sql`
        INSERT INTO inscripcion_programa (id_programa, id_invitado, estado, fecha_inscripcion)
        VALUES (${programaId}, ${guestId}, 'activo', NOW())
        ON CONFLICT ON CONSTRAINT inscripcion_programa_id_programa_id_invitado_key
        DO UPDATE SET estado = 'activo', updated_at = NOW()
        RETURNING id_inscripcion_programa
      `;
      return NextResponse.json({ success: true, message: 'Inscripción al programa exitosa', id_inscripcion: ins[0].id_inscripcion_programa });
    }
  } catch (error) {
    console.error('Error en inscripción a programa:', error);
    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: false, error: 'Error al inscribirse al programa' }, { status: 500 });
  }
}
