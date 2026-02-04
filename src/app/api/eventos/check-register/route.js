// src/app/api/eventos/check-register/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventoId = searchParams.get('id');
    const userId = searchParams.get('userId');

    console.log(`[API check-register] Received: eventoId=${eventoId}, userId=${userId}`);

    if (!eventoId || isNaN(Number(eventoId)) || !userId || isNaN(Number(userId))) {
      console.error(`[API check-register] Validation Error: eventoId='${eventoId}', userId='${userId}'`);
      return NextResponse.json(
        { error: 'ID de evento y ID de usuario son requeridos y deben ser números válidos.' },
        { status: 400 }
      );
    }
    
    // Se asume que si llega un userId, es un id_miembro porque el frontend
    // solo llama a esta ruta con userId cuando el usuario está autenticado.
    const [registro] = await sql`
      SELECT ie.id_inscripcion, ie.id_evento, ie.fecha_inscripcion
      FROM inscripcion_evento ie
      LEFT JOIN equipo_concurso eq ON ie.id_equipo = eq.id_equipo
      LEFT JOIN integrante_equipo int_eq ON eq.id_equipo = int_eq.id_equipo
      WHERE ie.id_evento = ${eventoId} 
        AND (ie.id_miembro = ${userId} OR int_eq.id_miembro = ${userId})
      LIMIT 1
    `;
    
    console.log(`[API check-register] Query Result for (evento: ${eventoId}, miembro: ${userId}):`, registro);

    let qrToken = null;
    if (registro) {
         const crypto = await import('crypto');
         const secret = process.env.Payload_SECRET || 'secret-key-crocoders-secure';
         // Usamos fecha de inscripción para que sea determinista y el token no cambie
         const ts = new Date(registro.fecha_inscripcion).getTime();
         const qrPayload = JSON.stringify({ 
             id: registro.id_inscripcion, 
             eid: registro.id_evento,
             ts: ts 
         });
         const hash = crypto.createHmac('sha256', secret).update(qrPayload).digest('hex');
         qrToken = Buffer.from(JSON.stringify({ data: qrPayload, sig: hash })).toString('base64');
    }

    return NextResponse.json({
      registered: !!registro,
      qrToken: qrToken
    });

  } catch (error) {
    console.error('[API check-register] Error en GET:', error);
    return NextResponse.json(
      { error: 'Error al verificar el estado de inscripción: ' + error.message },
      { status: 500 }
    );
  }
}