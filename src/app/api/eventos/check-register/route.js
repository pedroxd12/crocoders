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
      SELECT 1 FROM asistencia_miembro 
      WHERE id_evento = ${eventoId} AND id_miembro = ${userId}
      LIMIT 1
    `;
    
    console.log(`[API check-register] Query Result for (evento: ${eventoId}, miembro: ${userId}):`, registro);

    return NextResponse.json({
      registered: !!registro // True si 'registro' tiene una fila (existe), false si no.
    });

  } catch (error) {
    console.error('[API check-register] Error en GET:', error);
    return NextResponse.json(
      { error: 'Error al verificar el estado de inscripción: ' + error.message },
      { status: 500 }
    );
  }
}