// POST /api/admin/inscripciones/[id]/reenviar-ticket
//
// Vuelve a emitir el ticket QR de una inscripción de evento y manda el correo
// de confirmación (a todo el equipo si lo es). Existe porque el envío
// automático puede fallar (SMTP caído, buzón lleno) y, sin esto, un invitado
// sin cuenta no tenía ninguna forma de recuperar su código de acceso.
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { firmarQrToken } from '@/lib/qr-token';
import { enviarConfirmacionEvento } from '@/lib/correo-inscripcion';

export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const idInscripcion = Number(id);
  if (!Number.isInteger(idInscripcion) || idInscripcion <= 0) {
    return NextResponse.json({ error: 'ID de inscripción inválido' }, { status: 400 });
  }

  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'El servidor no está configurado para emitir tickets.' }, { status: 500 });
  }

  const client = await connectWithRetry();
  try {
    const res = await client.query(
      `SELECT ie.id_inscripcion, ie.id_evento, ie.estado
         FROM inscripcion_evento ie
         JOIN evento e ON e.id_evento = ie.id_evento
        WHERE ie.id_inscripcion = $1 AND e.deleted_at IS NULL`,
      [idInscripcion],
    );
    if (res.rows.length === 0) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 });
    const inscripcion = res.rows[0];
    if (inscripcion.estado === 'cancelada') {
      return NextResponse.json({ error: 'La inscripción está cancelada.' }, { status: 400 });
    }

    const qrToken = firmarQrToken(
      { id: inscripcion.id_inscripcion, eid: Number(inscripcion.id_evento), ts: Date.now() },
      secret,
    );
    const correo = await enviarConfirmacionEvento({
      inscripcionId: inscripcion.id_inscripcion,
      eventoId: Number(inscripcion.id_evento),
      qrToken,
    });
    if (!correo.ok) {
      return NextResponse.json(
        { error: `No se pudo enviar el ticket${correo.motivo ? ` (${correo.motivo})` : ''}.`, correo },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, correo });
  } catch (error) {
    console.error('Error en POST /api/admin/inscripciones/[id]/reenviar-ticket:', error);
    return NextResponse.json({ error: 'Error al reenviar el ticket' }, { status: 500 });
  } finally {
    client.release();
  }
}
