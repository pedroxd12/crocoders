// src/app/api/eventos/check-register/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { firmarQrToken } from '@/lib/qr-token';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = Number(auth.session.id);

  try {
    const { searchParams } = new URL(request.url);
    const eventoId = searchParams.get('id');

    if (!eventoId || isNaN(Number(eventoId))) {
      return NextResponse.json(
        { error: 'ID de evento es requerido y debe ser un número válido.' },
        { status: 400 }
      );
    }

    // Inscripción directa o como integrante de un equipo. Además del id se
    // devuelve la mesa asignada y, en equipos, el nombre del equipo: es lo que
    // el ticket de la ficha pública muestra al participante.
    const registros = await sql`
      SELECT ie.id_inscripcion, ie.id_evento, ie.fecha_inscripcion, ie.mesa, NULL::text AS nombre_equipo
      FROM inscripcion_evento ie
      WHERE ie.id_evento = ${eventoId}
        AND ie.id_miembro = ${userId}
        AND ie.estado <> 'cancelada'

      UNION

      SELECT ie.id_inscripcion, ie.id_evento, ie.fecha_inscripcion, ie.mesa, eq.nombre_equipo
      FROM inscripcion_evento ie
      INNER JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
      INNER JOIN integrante_equipo int_eq ON eq.id_equipo = int_eq.id_equipo
      WHERE ie.id_evento = ${eventoId}
        AND int_eq.id_miembro = ${userId}
        AND ie.estado <> 'cancelada'

      LIMIT 1
    `;

    const registro = registros && registros.length > 0 ? registros[0] : null;

    let qrToken = null;
    if (registro) {
         const secret = process.env.PAYLOAD_SECRET;
         if (secret) {
             // El `ts` alimenta el control anti-replay de verify-qr (que ya no
             // caduca a las 24 h: el ticket vale hasta que termina el evento). Debe ser
             // el instante de EMISIÓN del token, no `fecha_inscripcion`:
             //  - fecha_inscripcion es `timestamp without time zone`; convertirla con
             //    new Date() la interpreta en hora local y la desfasa ~horas hacia el
             //    "futuro", lo que hacía a verify-qr rechazar el QR ("fecha futura").
             //  - además el QR debe seguir siendo válido cuando el usuario abre su
             //    ticket días después de inscribirse, no expirar 24h tras la inscripción.
             // Se genera fresco en cada lectura, igual que en /api/eventos/register.
             qrToken = firmarQrToken(
               { id: registro.id_inscripcion, eid: registro.id_evento, ts: Date.now() },
               secret,
             );
         }
    }

    return NextResponse.json({
      registered: !!registro,
      qrToken: qrToken,
      mesa: registro?.mesa ?? null,
      nombre_equipo: registro?.nombre_equipo ?? null,
    });

  } catch (error) {
    console.error('[API check-register] Error en GET:', error);
    return NextResponse.json(
      { error: 'Error al verificar el estado de inscripción' },
      { status: 500 }
    );
  }
}
