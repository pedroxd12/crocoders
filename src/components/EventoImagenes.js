'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function EventoImagenes({ eventoId }) {
  const [imagenes, setImagenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchImagenes = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/eventos/${eventoId}/imagenes`);
        if (!res.ok) throw new Error('Error al cargar imágenes');
        const data = await res.json();
        setImagenes(data);
      } catch (err) {
        console.error('Error:', err);
        setError('Error al cargar imágenes');
      } finally {
        setLoading(false);
      }
    };

    if (eventoId) {
      fetchImagenes();
    }
  }, [eventoId]);

  if (loading) return <div className="mt-8 text-center">Cargando imágenes...</div>;
  if (error) return <div className="mt-8 text-center text-red-400">{error}</div>;
  if (!imagenes || imagenes.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold mb-4">Galería del Evento</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {imagenes.map((imagen) => (
          <div key={imagen.id_imagen} className="relative aspect-square">
            <Image
              src={imagen.ruta || '/placeholder-event.jpg'}
              alt={`Imagen del evento ${eventoId}`}
              fill
              className="object-cover rounded-lg"
              onError={(e) => {
                e.target.src = '/placeholder-event.jpg';
                e.target.onerror = null;
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}