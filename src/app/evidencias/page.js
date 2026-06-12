// src/app/evidencias/page.js
"use client";

import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { CalendarDays, MapPin, X, ArrowRight, Image as ImageIcon } from 'lucide-react';
import styles from './page.module.css';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function EvidenciasPage() {
  const [eventsWithEvidencias, setEventsWithEvidencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventImages, setEventImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);

  // Initial Data Fetch. El backend ya filtra eventos con evidencias públicas,
  // los agrupa por evento (sin duplicados) y los ordena por fecha desc, así que
  // aquí no hace falta volver a filtrar/deduplicar/ordenar.
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await fetch('/api/evidencias');
        if (!response.ok) throw new Error('Error al cargar eventos');
        const data = await response.json();
        setEventsWithEvidencias(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error:', error);
        setError('No se pudieron cargar los eventos. Intenta de nuevo más tarde.');
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  // Fetch images for a specific event
  const handleEventClick = async (event) => {
    setSelectedEvent(event);
    setLoadingImages(true);
    setEventImages([]);
    
    try {
      // La línea de tiempo mezcla eventos y programas; cada item trae
      // `tipo_origen` ('evento'|'programa') y `origen_id` para pedir su galería.
      const qs = event.tipo_origen === 'programa'
        ? `programa=${event.origen_id}`
        : `evento=${event.origen_id}`;
      const response = await fetch(`/api/evidencias?${qs}`);
      if (!response.ok) throw new Error('Error al cargar imágenes');
      const images = await response.json();
      setEventImages(images);
    } catch (error) {
      console.error('Error fetching images:', error);
    } finally {
      setLoadingImages(false);
    }
  };

  const closeGallery = () => {
    setSelectedEvent(null);
    setEventImages([]);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        timeZone: 'UTC' 
    }).format(date);
  };

  if (loading) {
    return (
      <div className={styles.pageWrapper}>
         <div className={styles.loaderContainer}>
            <LoadingSpinner size="lg" text="Cargando línea del tiempo..." />
         </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pageWrapper}>
         <div className={styles.loaderContainer} style={{ flexDirection: 'column', gap: '1rem', color: '#ef4444' }}>
            <p>{error}</p>
         </div>
      </div>
    );
  }

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        <motion.div 
            className={styles.header}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
        >
          <h1 className={styles.title}>Galería de evidencias</h1>
          <p className={styles.description}>
            Explora los momentos capturados de nuestras actividades.
          </p>
        </motion.div>

        <div className={styles.timelineContainer}>
          <div className={styles.timelineLine}></div>
          
          {eventsWithEvidencias.map((event, index) => (
            <motion.div
                key={`${event.tipo_origen || 'evento'}-${event.origen_id ?? event.id_evento}`}
                className={styles.timelineItem}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <div className={styles.timelineDate}>
                <span className={styles.dateBadge}>
                  {formatDate(event.fecha)}
                </span>
              </div>

              <div className={styles.timelineDot}></div>

              <div className={styles.timelineContent} onClick={() => handleEventClick(event)}>
                <h3 className={styles.eventTitle}>{event.nombre_evento}</h3>

                <div className={styles.eventMeta}>
                    {event.tipo_origen === 'programa' && (
                        <div className={styles.metaItem}>
                            <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30">Programa</span>
                        </div>
                    )}
                    {event.tipo && (
                        <div className={styles.metaItem}>
                            <span className="capitalize">{event.tipo}</span>
                        </div>
                    )}
                    {event.lugar && (
                        <div className={styles.metaItem}>
                            <MapPin size={14} />
                            <span>{event.lugar}</span>
                        </div>
                    )}
                </div>

                <div className={styles.eventPreview}>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10" />
                    {event.portada_url ? (
                        <Image
                            src={event.portada_url}
                            alt={event.nombre_evento}
                            fill
                            sizes="(max-width: 768px) 100vw, 33vw"
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-gray-700">
                            <ImageIcon size={48} opacity={0.2} />
                        </div>
                    )}

                    <div className={styles.evidenceCount}>
                        <ImageIcon size={14} className="mr-1"/>
                        {event.num_evidencias} fotos
                    </div>
                </div>

                <button className={styles.viewButton}>
                    Ver Galería <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedEvent && (
            <motion.div 
                className={styles.galleryOverlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <motion.div 
                    className={styles.galleryContainer}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                >
                    <button className={styles.closeButton} onClick={closeGallery}>
                        <X size={24} />
                    </button>

                    <div className={styles.galleryHeader}>
                        <h2 className={styles.galleryTitle}>{selectedEvent.nombre_evento}</h2>
                        <div className={styles.galleryDate}>
                            <CalendarDays size={18} />
                            {formatDate(selectedEvent.fecha)}
                            <span className="mx-2">•</span>
                            <span>{eventImages.length} fotos</span>
                        </div>
                    </div>

                    <div className={styles.galleryGrid}>
                        {loadingImages ? (
                            <div className="flex justify-center items-center w-full h-full min-h-[300px]">
                                <LoadingSpinner size="lg" />
                            </div>
                        ) : (
                            eventImages.map((img, idx) => (
                                <motion.div 
                                    key={img.id_evidencia} 
                                    className={styles.galleryItem}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    onClick={() => setExpandedImage(img)}
                                >
                                    <Image 
                                        src={img.imagen_url} 
                                        alt={img.nombre || 'Evidencia'} 
                                        fill
                                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                        className={styles.galleryImage}
                                    />
                                </motion.div>
                            ))
                        )}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {expandedImage && (
            <motion.div 
                className={styles.lightbox}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setExpandedImage(null)}
            >
                <motion.img
                    src={expandedImage.imagen_url} 
                    alt={expandedImage.nombre}
                    className={styles.lightboxImage}
                    layoutId={`img-${expandedImage.id_evidencia}`}
                    onClick={(e) => e.stopPropagation()} 
                />
                <button 
                  className={styles.closeButton} 
                  style={{ top: '2rem', right: '2rem' }}
                  onClick={() => setExpandedImage(null)}
                >
                    <X size={32} />
                </button>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}