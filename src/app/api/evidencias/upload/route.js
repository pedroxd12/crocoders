// src/app/api/evidencias/upload/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    // Se espera JSON con la URL de la imagen de UploadThing y otros metadatos
    const data = await request.json();
    const { id_evento, nombre, imagen_url, imagen_key } = data;

    if (!id_evento || !imagen_url || !imagen_key) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: id_evento, imagen_url, imagen_key' },
        { status: 400 }
      );
    }

    const nombreEvidencia = nombre || 'Evidencia sin nombre';

    // Guardar en la base de datos
    const [nuevaEvidencia] = await sql`
      INSERT INTO evidencias (id_evento, nombre, imagen_url, imagen_key)
      VALUES (${id_evento}, ${nombreEvidencia}, ${imagen_url}, ${imagen_key})
      RETURNING *
    `;

    return NextResponse.json(nuevaEvidencia);
  } catch (error) {
    console.error('Error al guardar evidencia (metadata):', error);
    // Verifica si el error es por Content-Type, aunque ahora debería ser JSON
    if (error.message.includes("Content-Type")) {
        console.error("Posiblemente se sigue enviando FormData en lugar de JSON a este endpoint.");
    }
    return NextResponse.json(
      { error: 'Error al guardar evidencia (metadata): ' + error.message },
      { status: 500 }
    );
  }
}