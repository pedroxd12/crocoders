// src/app/api/evidencias/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export const dynamic = 'force-dynamic'; // Se evalúa dinámicamente en cada solicitud

// GET público:
//  - ?evento=<id>   -> evidencias públicas de ese evento.
//  - ?programa=<id> -> evidencias públicas de ese programa.
//  - sin parámetro  -> línea de tiempo mixta: eventos Y programas que tienen
//    evidencias públicas, ordenados por fecha desc. Cada item lleva
//    `tipo_origen` ('evento'|'programa') y `origen_id` para pedir su galería.
// La creación/edición/borrado vive en /api/evidencias/upload y /api/evidencias/[id]
// (ambos protegidos por requireAdmin). Este archivo NO expone POST.
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const eventoIdParam = url.searchParams.get('evento');
    const programaIdParam = url.searchParams.get('programa');

    // --- Galería de un EVENTO ---
    if (eventoIdParam) {
      if (isNaN(Number(eventoIdParam))) {
        return NextResponse.json({ error: 'El ID de evento proporcionado no es un número válido.' }, { status: 400 });
      }
      const evidencias = await sql`
        SELECT id_evidencia, id_evento, id_programa, titulo as nombre, descripcion, tipo,
               url as imagen_url, storage_key as imagen_key, publica, orden, fecha_captura as fecha
        FROM evidencia
        WHERE id_evento = ${Number(eventoIdParam)} AND publica = true
        ORDER BY orden ASC, fecha_captura DESC
      `;
      return NextResponse.json(evidencias);
    }

    // --- Galería de un PROGRAMA ---
    if (programaIdParam) {
      if (isNaN(Number(programaIdParam))) {
        return NextResponse.json({ error: 'El ID de programa proporcionado no es un número válido.' }, { status: 400 });
      }
      const evidencias = await sql`
        SELECT id_evidencia, id_evento, id_programa, titulo as nombre, descripcion, tipo,
               url as imagen_url, storage_key as imagen_key, publica, orden, fecha_captura as fecha
        FROM evidencia
        WHERE id_programa = ${Number(programaIdParam)} AND publica = true
        ORDER BY orden ASC, fecha_captura DESC
      `;
      return NextResponse.json(evidencias);
    }

    // --- Línea de tiempo mixta (eventos + programas con evidencias públicas) ---
    // UNION ALL de ambas fuentes con un esquema común; el front las mezcla y ordena.
    const timeline = await sql`
      SELECT
        'evento' AS tipo_origen,
        e.id_evento AS origen_id,
        e.nombre AS nombre_evento,
        e.fecha_inicio AS fecha,
        t.nombre AS tipo,
        e.ubicacion AS lugar,
        (SELECT COUNT(*) FROM evidencia ev WHERE ev.id_evento = e.id_evento AND ev.publica = true) AS num_evidencias,
        (SELECT ev.url FROM evidencia ev
          WHERE ev.id_evento = e.id_evento AND ev.publica = true
          ORDER BY ev.orden ASC, ev.fecha_captura DESC LIMIT 1) AS portada_url
      FROM evento e
      LEFT JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
      WHERE EXISTS (SELECT 1 FROM evidencia ev WHERE ev.id_evento = e.id_evento AND ev.publica = true)

      UNION ALL

      SELECT
        'programa' AS tipo_origen,
        p.id_programa AS origen_id,
        p.nombre AS nombre_evento,
        p.fecha_inicio AS fecha,
        t.nombre AS tipo,
        p.ubicacion AS lugar,
        (SELECT COUNT(*) FROM evidencia ev WHERE ev.id_programa = p.id_programa AND ev.publica = true) AS num_evidencias,
        (SELECT ev.url FROM evidencia ev
          WHERE ev.id_programa = p.id_programa AND ev.publica = true
          ORDER BY ev.orden ASC, ev.fecha_captura DESC LIMIT 1) AS portada_url
      FROM programa_recurrente p
      LEFT JOIN catalogo_tipo_evento t ON p.id_tipo_evento = t.id_tipo_evento
      WHERE EXISTS (SELECT 1 FROM evidencia ev WHERE ev.id_programa = p.id_programa AND ev.publica = true)

      ORDER BY fecha DESC
    `;
    return NextResponse.json(timeline);
  } catch (error) {
    console.error('[API /api/evidencias] Error en GET:', error);
    return NextResponse.json(
      { error: 'Error al obtener datos de evidencias' },
      { status: 500 },
    );
  }
}
