// src/app/api/eventos/check-register/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';

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

    const registros = await sql`
      SELECT DISTINCT ie.id_inscripcion, ie.id_evento, ie.fecha_inscripcion
      FROM inscripcion_evento ie
      WHERE ie.id_evento = ${eventoId}
        AND ie.id_miembro = ${userId}

      UNION

      SELECT DISTINCT ie.id_inscripcion, ie.id_evento, ie.fecha_inscripcion
      FROM inscripcion_evento ie
      INNER JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
      INNER JOIN integrante_equipo int_eq ON eq.id_equipo = int_eq.id_equipo
      WHERE ie.id_evento = ${eventoId}
        AND int_eq.id_miembro = ${userId}

      LIMIT 1
    `;

    const registro = registros && registros.length > 0 ? registros[0] : null;

    let qrToken = null;
    if (registro) {
         const crypto = await import('crypto');
         const secret = process.env.PAYLOAD_SECRET;
         if (secret) {
             const ts = new Date(registro.fecha_inscripcion).getTime();
             const qrPayload = JSON.stringify({
                 id: registro.id_inscripcion,
                 eid: registro.id_evento,
                 ts: ts
             });
             const hash = crypto.createHmac('sha256', secret).update(qrPayload).digest('hex');
             qrToken = Buffer.from(JSON.stringify({ data: qrPayload, sig: hash })).toString('base64');
         }
    }

    return NextResponse.json({
      registered: !!registro,
      qrToken: qrToken
    });

  } catch (error) {
    console.error('[API check-register] Error en GET:', error);
    return NextResponse.json(
      { error: 'Error al verificar el estado de inscripción' },
      { status: 500 }
    );
  }
}