// src/app/api/evidencias/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server'; // Asegúrate que la ruta a tu conexión de DB sea correcta

export const dynamic = 'force-dynamic'; // Asegura que la ruta se evalúe dinámicamente en cada solicitud

export async function GET(request) {
  // Log inicial para ver la URL completa que llega al backend
  console.log(`[API /api/evidencias] Solicitud GET recibida. URL: ${request.url}`);

  try {
    // Es buena práctica parsear la URL dentro del bloque try
    const url = new URL(request.url);
    const eventoIdParam = url.searchParams.get('evento');
    
    console.log(`[API /api/evidencias] Parámetro 'evento' extraído: '${eventoIdParam}'`);

    if (eventoIdParam) {
      // Lógica para cuando se solicita evidencias de UN evento específico
      console.log(`[API /api/evidencias] Manejando solicitud para ID de evento específico: ${eventoIdParam}`);
      
      if (isNaN(Number(eventoIdParam))) {
        console.error(`[API /api/evidencias] ID de evento no válido: ${eventoIdParam}. Retornando 400.`);
        return NextResponse.json({ error: 'El ID de evento proporcionado no es un número válido.' }, { status: 400 });
      }

      const evidencias = await sql`
        SELECT 
          id_evidencia, 
          id_evento, 
          titulo as nombre, 
          url as imagen_url, 
          storage_key as imagen_key, 
          fecha_captura as fecha
        FROM evidencia
        WHERE id_evento = ${Number(eventoIdParam)} AND publica = true
        ORDER BY fecha_captura DESC
      `;
      console.log(`[API /api/evidencias] Encontradas ${evidencias.length} evidencias para el evento ${eventoIdParam}.`);
      return NextResponse.json(evidencias);

    } else {
      // Lógica para cuando se solicita la LISTA de eventos que tienen evidencias
      console.log(`[API /api/evidencias] Manejando solicitud para la lista de eventos con evidencias.`);
      
      const eventsWithEvidencias = await sql`
        SELECT 
          e.id_evento, 
          e.nombre as nombre_evento, 
          e.fecha_inicio as fecha,
          e.descripcion_html as descripcion,
          a.nombre as hermandad,
          t.nombre as tipo,
          e.ubicacion as lugar,
          (SELECT COUNT(*) FROM evidencia ev WHERE ev.id_evento = e.id_evento AND ev.publica = true) as num_evidencias
        FROM evento e
        LEFT JOIN catalogo_alcance_evento a ON e.id_alcance = a.id_alcance
        LEFT JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
        WHERE (SELECT COUNT(*) FROM evidencia ev WHERE ev.id_evento = e.id_evento AND ev.publica = true) > 0
        ORDER BY e.fecha_inicio DESC
      `;
      console.log(`[API /api/evidencias] Encontrados ${eventsWithEvidencias.length} eventos con evidencias.`);
      return NextResponse.json(eventsWithEvidencias);
    }
  } catch (error) {
    // Captura de errores general
    console.error(`[API /api/evidencias] ERROR EN BLOQUE CATCH:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error desconocido en el servidor.';
    return NextResponse.json(
      { error: 'Error al obtener datos de evidencias: ' + errorMessage },
      { status: 500 } // Usar 500 para errores internos/inesperados
    );
  }
}

// La función POST para subir metadatos de evidencias
export async function POST(request) {
  console.log(`[API /api/evidencias] Solicitud POST recibida. URL: ${request.url}`);
  try {
    const data = await request.json();
    console.log(`[API /api/evidencias] Datos POST:`, data);
    const { id_evento, nombre, imagen_url, imagen_key } = data;

    if (!id_evento || !imagen_url || !imagen_key) {
      console.error(`[API /api/evidencias] Error de Validación en POST: Faltan campos. id_evento: ${id_evento}, imagen_url: ${imagen_url}, imagen_key: ${imagen_key}`);
      return NextResponse.json(
        { error: 'Faltan campos requeridos: id_evento, imagen_url, imagen_key.' },
        { status: 400 }
      );
    }
    const nombreEvidencia = nombre || 'Evidencia sin nombre'; // Nombre por defecto si no se provee
    
    // Se asume tipo imagen por defecto, y orden 0
    const [nuevaEvidencia] = await sql`
      INSERT INTO evidencia (id_evento, titulo, url, storage_key, tipo, fecha_captura, publica, orden)
      VALUES (${id_evento}, ${nombreEvidencia}, ${imagen_url}, ${imagen_key}, 'imagen', NOW(), true, 0)
      RETURNING id_evidencia, id_evento, titulo as nombre, url as imagen_url, storage_key as imagen_key, fecha_captura as fecha
    `;
    console.log(`[API /api/evidencias] POST Exitoso. ID de nueva evidencia: ${nuevaEvidencia?.id_evidencia}`);
    return NextResponse.json(nuevaEvidencia, { status: 201 }); // 201 Created es más apropiado

  } catch (error) {
    console.error(`[API /api/evidencias] ERROR EN BLOQUE CATCH (POST):`, error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido al guardar la evidencia.';
    return NextResponse.json(
      { error: 'Error al guardar metadata de evidencia: ' + errorMessage },
      { status: 500 }
    );
  }
}