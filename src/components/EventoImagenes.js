'use client';

import { useState } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { ImageOff } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';

/**
 * Galería de fotos del evento (las evidencias marcadas como públicas).
 *
 * El componente existía pero nadie lo montaba: la carpeta del API respondía y
 * ningún cliente la llamaba. Aquí se conecta a la ficha del evento y, de paso:
 *  - usa SWR en lugar de un fetch manual sin caché,
 *  - marca las imágenes rotas con estado de React en vez de mutar
 *    `e.target.src`, que con `next/image fill` no funciona de forma fiable,
 *  - no renderiza nada si el evento no tiene fotos, en lugar de dejar un
 *    "Cargando imágenes..." suelto en mitad de la página.
 */
export default function EventoImagenes({ eventoId }) {
  const { data, isLoading } = useSWR(
    eventoId ? `/api/eventos/${eventoId}/imagenes` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [fallidas, setFallidas] = useState({});

  const imagenes = Array.isArray(data) ? data : [];

  // Mientras carga no ocupa sitio: la galería es contenido secundario y un
  // bloque de carga aquí sólo empujaría el resto de la ficha hacia abajo.
  if (isLoading || imagenes.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 md:p-8">
      <h2 className="mb-6 text-2xl font-bold text-fg">Galería del evento</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {imagenes.map((imagen) => (
          <div
            key={imagen.id_imagen}
            className="relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-2"
          >
            {imagen.ruta && !fallidas[imagen.id_imagen] ? (
              <Image
                src={imagen.ruta}
                alt={imagen.nombre_archivo || 'Fotografía del evento'}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover"
                onError={() => setFallidas((prev) => ({ ...prev, [imagen.id_imagen]: true }))}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-faint">
                <ImageOff size={24} aria-hidden="true" />
                <span className="text-xs">Imagen no disponible</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
