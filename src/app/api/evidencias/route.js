// src/app/api/evidencias/route.js
import { NextResponse } from 'next/server';
import {
  listarTimelineEvidencias,
  listarEvidenciasDeEvento,
  listarEvidenciasDePrograma,
} from '@/lib/evidencias-listado';

export const dynamic = 'force-dynamic'; // Se evalúa dinámicamente en cada solicitud

// Caché de CDN para las respuestas públicas.
//
// Son fotos de actividades YA CELEBRADAS: sólo cambian cuando un admin sube o
// retira material, nunca por acción del visitante. Sin esta cabecera cada
// petición arrancaba la función y abría conexión a la base de datos — 0.49 s
// medidos contra producción, y hasta 1.5 s si la función estaba fría — para
// devolver los mismos 272 bytes.
//
// La ventana de `stale-while-revalidate` es larga a propósito, igual que en
// /api/puntajes: con una corta, cualquier visita tras unos minutos de silencio
// vuelve a caer en MISS y paga otra vez el arranque en frío. Así ese coste lo
// paga la revalidación en segundo plano y no la persona que abre la página; a
// cambio, una foto recién subida puede tardar hasta un minuto en aparecer.
const CACHE_PUBLICO = 'public, s-maxage=60, stale-while-revalidate=86400';

// GET público:
//  - ?evento=<id>   -> evidencias públicas de ese evento.
//  - ?programa=<id> -> evidencias públicas de ese programa.
//  - sin parámetro  -> línea de tiempo mixta: eventos Y programas que tienen
//    evidencias públicas, ordenados por fecha desc. Cada item lleva
//    `tipo_origen` ('evento'|'programa') y `origen_id` para pedir su galería.
//
// Las consultas viven en src/lib/evidencias-listado.js porque la página
// /evidencias precarga la línea de tiempo en el servidor para mandarla dentro
// del HTML. Este endpoint sigue sirviendo las galerías, que se piden al pulsar
// una actividad, y las revalidaciones de SWR.
//
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
      return NextResponse.json(await listarEvidenciasDeEvento(eventoIdParam), {
        headers: { 'Cache-Control': CACHE_PUBLICO },
      });
    }

    // --- Galería de un PROGRAMA ---
    if (programaIdParam) {
      if (isNaN(Number(programaIdParam))) {
        return NextResponse.json({ error: 'El ID de programa proporcionado no es un número válido.' }, { status: 400 });
      }
      return NextResponse.json(await listarEvidenciasDePrograma(programaIdParam), {
        headers: { 'Cache-Control': CACHE_PUBLICO },
      });
    }

    // --- Línea de tiempo mixta (eventos + programas con evidencias públicas) ---
    return NextResponse.json(await listarTimelineEvidencias(), {
      headers: { 'Cache-Control': CACHE_PUBLICO },
    });
  } catch (error) {
    console.error('[API /api/evidencias] Error en GET:', error);
    return NextResponse.json(
      { error: 'Error al obtener datos de evidencias' },
      // El error NO se cachea: si la base falla, la siguiente visita debe
      // volver a intentarlo en vez de recibir el fallo guardado un día entero.
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
