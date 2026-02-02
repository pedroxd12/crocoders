// src/app/evidencias/page.js
"use client";

import { motion } from 'framer-motion';
import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import LoadingSpinner from '@/components/LoadingSpinner'; // Asegúrate de tener este componente
import { Camera, CalendarDays, ChevronDown, ChevronUp, MapPin, ImageOff, XCircle, Loader as IconLoader } from 'lucide-react';

export default function EvidenciasPublicPage() {
  const [eventsWithEvidencias, setEventsWithEvidencias] = useState([]);
  const [selectedEventModal, setSelectedEventModal] = useState(null);
  const [detailedEventImages, setDetailedEventImages] = useState({});
  
  const [loadingStates, setLoadingStates] = useState({
    initialEvents: true,
    eventDetails: {} // { [eventId]: boolean }
  });

  const [expandedEvents, setExpandedEvents] = useState({});

  const preloadImages = useCallback((imageUrls) => {
    if (typeof window === 'undefined' || !imageUrls || imageUrls.length === 0) return Promise.resolve();
    
    // console.log('[EvidenciasPage] Preloading images:', imageUrls.slice(0,3));
    return Promise.all(
      imageUrls.map(url => {
        return new Promise((resolve) => { 
          const img = new window.Image();
          img.src = url;
          img.onload = () => { /* console.log(`[EvidenciasPage] Preloaded: ${url}`); */ resolve(); };
          img.onerror = () => { /* console.warn(`[EvidenciasPage] Failed to preload: ${url}`); */ resolve(); };
        });
      })
    );
  }, []);

  const formatDate = useCallback((dateString) => {
    if (!dateString || typeof dateString !== 'string') {
      // console.log('[EvidenciasPage] formatDate: input not a valid string', dateString);
      return "Fecha desconocida";
    }
  
    let dateObj;
    const trimmedDateString = dateString.trim();
  
    // Escenario 1: La entrada es probablemente YYYY-MM-DD (solo fecha)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDateString)) {
      // Añadir hora y Z para interpretar como medianoche UTC
      dateObj = new Date(trimmedDateString + 'T00:00:00.000Z');
    } 
    // Escenario 2: La entrada podría ser una cadena ISO completa u otra cosa que Date maneje
    else {
      dateObj = new Date(trimmedDateString);
    }
  
    // Comprobar si dateObj es válido
    if (isNaN(dateObj.getTime())) {
      // console.warn(`[EvidenciasPage] formatDate: Failed to parse date string: "${dateString}" (Processed as: "${trimmedDateString}")`);
      return "Fecha inválida";
    }
  
    // Formatear la fecha en español, asegurando que la salida refleje la fecha en UTC.
    try {
      return dateObj.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC' // Clave para una salida consistente independientemente de la zona horaria del cliente
      });
    } catch (e) {
      // console.error('[EvidenciasPage] formatDate: Error during toLocaleDateString', e);
      return "Fecha inválida"; 
    }
  }, []);

  const fetchInitialEventsList = useCallback(async () => {
    // console.log('[EvidenciasPage] Fetching initial events list...');
    setLoadingStates(prev => ({ ...prev, initialEvents: true }));
    try {
      const response = await fetch('/api/evidencias'); 
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error al cargar la lista de eventos con evidencias (HTTP ${response.status})`);
      }
      let data = await response.json();
      // console.log('[EvidenciasPage] Raw events data from API:', data);
      
      data = data
        .filter(event => event.num_evidencias > 0)
        .sort((a, b) => {
            // Función auxiliar para parsear la fecha consistentemente para la ordenación
            const parseDateForSort = (fechaStr) => {
                if (!fechaStr || typeof fechaStr !== 'string') return new Date(NaN); // Fecha inválida
                const trimmed = fechaStr.trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                    return new Date(trimmed + 'T00:00:00.000Z');
                }
                return new Date(trimmed);
            };

            const dateA = parseDateForSort(a.fecha);
            const dateB = parseDateForSort(b.fecha);

            // Manejar fechas inválidas en la ordenación
            const timeA = dateA.getTime();
            const timeB = dateB.getTime();

            if (isNaN(timeA) && isNaN(timeB)) return 0;
            if (isNaN(timeA)) return 1; // Poner fechas inválidas al final (o al principio con -1)
            if (isNaN(timeB)) return -1;

            return timeB - timeA; // Para orden descendente (más reciente primero)
        });
      
      // console.log('[EvidenciasPage] Filtered and sorted events:', data);
      setEventsWithEvidencias(data);

    } catch (err) {
      console.error("[EvidenciasPage] Error fetching initial events list:", err);
      toast.error(err.message || 'Error al cargar eventos.', { theme: "dark" });
    } finally {
      setLoadingStates(prev => ({ ...prev, initialEvents: false }));
    }
  }, []); // formatDate no es dependencia directa aquí, pero su lógica es relevante para la ordenación

  useEffect(() => {
    fetchInitialEventsList();
  }, [fetchInitialEventsList]);

  const fetchAndSetEventImages = useCallback(async (eventId, forModal = false) => {
    // console.log(`[EvidenciasPage] Fetching images for event ${eventId}. For modal: ${forModal}`);
    setLoadingStates(prev => ({ ...prev, eventDetails: { ...prev.eventDetails, [eventId]: true } }));
    try {
      const response = await fetch(`/api/evidencias?evento=${eventId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error al cargar las evidencias del evento (HTTP ${response.status})`);
      }
      const evidenciasData = await response.json();
      // console.log(`[EvidenciasPage] Evidencias data for event ${eventId}:`, evidenciasData);

      if (evidenciasData && evidenciasData.length > 0) {
        await preloadImages(evidenciasData.map(img => img.imagen_url));
      }

      if (forModal) {
        const eventMeta = eventsWithEvidencias.find(e => e.id_evento.toString() === eventId.toString());
        setSelectedEventModal({ ...(eventMeta || {}), images: evidenciasData });
      } else {
        setDetailedEventImages(prev => ({ ...prev, [eventId]: evidenciasData }));
      }

    } catch (err) {
      console.error(`[EvidenciasPage] Error fetching images for event ${eventId}:`, err);
      toast.error(err.message || `Error al cargar imágenes para el evento.`, { theme: "dark" });
      if (forModal) setSelectedEventModal(prev => prev ? {...prev, images: []} : null);
      else setDetailedEventImages(prev => ({ ...prev, [eventId]: [] }));
    } finally {
      setLoadingStates(prev => ({ ...prev, eventDetails: { ...prev.eventDetails, [eventId]: false } }));
    }
  }, [eventsWithEvidencias, preloadImages]);


  const toggleEventExpansion = useCallback((eventId) => {
    const isCurrentlyExpanded = !!expandedEvents[eventId];
    // console.log(`[EvidenciasPage] Toggling expansion for event ${eventId}. Currently expanded: ${isCurrentlyExpanded}`);
    setExpandedEvents(prev => ({ ...prev, [eventId]: !isCurrentlyExpanded }));

    if (!isCurrentlyExpanded && !detailedEventImages[eventId]) {
      // console.log(`[EvidenciasPage] Fetching images for inline display for event ${eventId}.`);
      fetchAndSetEventImages(eventId, false);
    }
  }, [expandedEvents, detailedEventImages, fetchAndSetEventImages]);

  const openImageGalleryModal = (event) => {
    // console.log(`[EvidenciasPage] Opening image gallery modal for event ${event.id_evento}.`);
    const eventDataForModal = eventsWithEvidencias.find(e => e.id_evento === event.id_evento);
    
    if (detailedEventImages[event.id_evento] && detailedEventImages[event.id_evento].length > 0) {
      // console.log(`[EvidenciasPage] Using already loaded images for modal for event ${event.id_evento}.`);
      setSelectedEventModal({ ...eventDataForModal, images: detailedEventImages[event.id_evento]});
    } else {
      // console.log(`[EvidenciasPage] Fetching images specifically for modal for event ${event.id_evento}.`);
      fetchAndSetEventImages(event.id_evento, true); 
    }
  };

  // formatDate se define arriba con useCallback
  
  const getCategoryStyle = (hermandad) => {
    const lowerHermandad = hermandad?.toLowerCase() || 'club de programación'; 
    
    if (lowerHermandad.includes('computer society')) {
      return {
        name: 'Computer Society',
        bgIcon: 'bg-purple-500/20', textIcon: 'text-purple-400',
        borderTimeline: 'border-purple-500',
        bgCard: 'bg-gradient-to-br from-gray-800 via-purple-900/30 to-gray-800',
        shadowCard: 'hover:shadow-purple-500/20',
        tagBg: 'bg-purple-500/20', tagText: 'text-purple-300', tagBorder: 'border-purple-700',
        buttonClass: 'bg-purple-600 hover:bg-purple-700 text-white',
        timelineNode: 'bg-gradient-to-br from-purple-500 to-fuchsia-500',
      };
    }
    return { 
      name: 'Club de Programación',
      bgIcon: 'bg-green-500/10', textIcon: 'text-green-400',
      borderTimeline: 'border-green-500',
      bgCard: 'bg-gradient-to-br from-gray-800 via-green-900/30 to-gray-800',
      shadowCard: 'hover:shadow-green-500/20',
      tagBg: 'bg-green-500/20', tagText: 'text-green-300', tagBorder: 'border-green-700',
      buttonClass: 'bg-green-600 hover:bg-green-700 text-gray-900', // Originalmente text-white, ajustado a text-gray-900 por contraste con botón verde
      timelineNode: 'bg-gradient-to-br from-green-500 to-emerald-500',
    };
  };

  if (loadingStates.initialEvents) {
    return <LoadingSpinner fullScreen text="Cargando galería de evidencias..." />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white relative overflow-hidden py-10">
      <div className="absolute inset-0 z-0 opacity-5">
          <div className="absolute inset-0" style={{ 
            backgroundImage: 'radial-gradient(circle at 25px 25px, #ffffff 2%, transparent 0%)',
            backgroundSize: '50px 50px' 
          }}></div>
      </div>

      <motion.section 
        className="relative text-center px-4 z-10 pt-16 pb-12"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}
      >
        <div className={`mb-5 inline-block p-4 rounded-full border-2 shadow-lg ${getCategoryStyle('club de programación').bgIcon} ${getCategoryStyle('club de programación').borderTimeline}/30`}> {/* Asegurar que esto usa una categoría base */}
            <Camera size={40} className={getCategoryStyle('club de programación').textIcon} />
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-teal-300 to-sky-300">
          Galería de Evidencias
        </h1>
        <p className="text-lg sm:text-xl text-gray-300/90 max-w-2xl mx-auto">
          Un vistazo a los momentos capturados en nuestros eventos, talleres y convivencias.
        </p>
      </motion.section>

      <div className="container mx-auto px-4 sm:px-6 py-8 relative z-10">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <div className="inline-block px-6 py-3 bg-gray-800/80 backdrop-blur-sm rounded-full border border-gray-700 shadow-md">
            <span className="text-green-400 font-bold text-lg">{eventsWithEvidencias.length}</span>
            <span className="text-gray-300 ml-2">
              {eventsWithEvidencias.length === 1 ? 'evento con evidencias' : 'eventos con evidencias'}
            </span>
          </div>
        </motion.div>

        <div className="relative">
          <div className="hidden md:block absolute left-1/2 w-1 h-full bg-gradient-to-b from-gray-700 via-gray-600 to-gray-700 transform -translate-x-1/2 rounded-full"></div>

          {eventsWithEvidencias.length > 0 ? (
            <div className="space-y-12 md:space-y-0">
              {eventsWithEvidencias.map((event, index) => {
                const styleProps = getCategoryStyle(event.hermandad);
                const isExpanded = !!expandedEvents[event.id_evento];
                const currentEventImages = detailedEventImages[event.id_evento] || [];
                const isLoadingDetails = loadingStates.eventDetails[event.id_evento];
                
                const alignmentClass = index % 2 === 0 ? 'md:flex-row-reverse' : 'md:flex-row';
                const cardMarginClass = index % 2 === 0 ? 'md:mr-auto' : 'md:ml-auto';

                return (
                  <motion.div
                    key={event.id_evento}
                    className={`relative flex flex-col md:items-center mb-12 md:mb-20 ${alignmentClass}`}
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                    viewport={{ once: true, amount: 0.2 }}
                  >
                    <div className={`hidden md:flex absolute left-1/2 w-8 h-8 rounded-full ${styleProps.timelineNode} transform -translate-x-1/2 items-center justify-center shadow-lg z-10 ring-4 ring-gray-900`}>
                      <div className={`w-3 h-3 rounded-full ${styleProps.name === 'Computer Society' ? 'bg-purple-300' : 'bg-green-300'}`}></div>
                    </div>
                    
                    <div className={`w-full md:w-5/12 p-5 sm:p-6 rounded-xl ${styleProps.bgCard} border ${styleProps.borderTimeline} shadow-xl transition-all duration-300 hover:shadow-2xl ${styleProps.shadowCard} ${cardMarginClass}`}>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styleProps.tagBg} ${styleProps.tagText} ${styleProps.tagBorder}`}>
                          {styleProps.name}
                        </span>
                        <p className="text-xs text-gray-400 mt-1 sm:mt-0 flex items-center">
                          <CalendarDays size={14} className="mr-1.5"/> {formatDate(event.fecha)}
                        </p>
                      </div>

                      <h3 className="text-xl sm:text-2xl font-bold mb-3 text-white">{event.nombre_evento}</h3>
                      
                        {event.lugar && (
                          <p className="text-xs text-gray-400 mb-4 flex items-center">
                              <MapPin size={14} className="mr-1.5"/> {event.lugar}
                          </p>
                        )}

                      <button
                        onClick={() => toggleEventExpansion(event.id_evento)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${styleProps.buttonClass} ${styleProps.shadowCard}`}
                        aria-expanded={isExpanded}
                      >
                        <span>{isExpanded ? 'Ocultar' : 'Mostrar'} {event.num_evidencias} {event.num_evidencias === 1 ? 'evidencia' : 'evidencias'}</span>
                        {isLoadingDetails ? <IconLoader size={18} className="animate-spin"/> : (isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />) }
                      </button>

                      {isExpanded && !isLoadingDetails && (
                        currentEventImages.length > 0 ? (
                          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {currentEventImages.slice(0, 6).map((img, imgIdx) => (
                              <motion.div
                                key={img.id_evidencia || imgIdx}
                                className="group relative aspect-square rounded-md overflow-hidden bg-gray-700 cursor-pointer"
                                whileHover={{ scale: 1.05, zIndex: 10 }}
                                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.2, delay: imgIdx * 0.05 }}
                                onClick={() => openImageGalleryModal(event)}
                              >
                                <Image
                                  src={img.imagen_url}
                                  alt={img.nombre || event.nombre_evento}
                                  fill
                                  className="object-cover transition-transform duration-300 group-hover:scale-110"
                                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                                  placeholder="blur"
                                  blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                                  onError={(e) => {e.target.onerror = null; e.target.src='/placeholder-image.jpg';}}
                                  unoptimized={true} 
                                />
                                {currentEventImages.length > 6 && imgIdx === 5 && (
                                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                        <span className="text-lg font-semibold text-white">+{currentEventImages.length - 5}</span>
                                    </div>
                                )}
                              </motion.div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-gray-400 text-center py-3">No hay imágenes para mostrar de este evento.</p>
                        )
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
             <motion.div 
              className="text-center py-16"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-block bg-gray-800/70 backdrop-blur-sm rounded-xl p-8 border border-gray-700">
                <Camera size={56} className="mx-auto mb-6 text-gray-500"/>
                <h3 className="text-2xl font-medium text-gray-300 mb-3">
                  Galería Vacía
                </h3>
                <p className="text-gray-400 max-w-md mx-auto">
                  Aún no hemos subido evidencias de nuestros eventos. ¡Vuelve pronto!
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {selectedEventModal && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm"
          onClick={() => setSelectedEventModal(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="max-w-4xl w-full max-h-[90vh] bg-gray-800 rounded-lg shadow-2xl relative overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gray-800/80 backdrop-blur-md z-10 px-4 sm:px-6 py-3 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-green-300">
                  {selectedEventModal.nombre_evento}
                </h2>
                <p className="text-xs text-gray-400">{formatDate(selectedEventModal.fecha)} - {getCategoryStyle(selectedEventModal.hermandad).name}</p>
              </div>
              <button 
                onClick={() => setSelectedEventModal(null)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                aria-label="Cerrar galería"
              >
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-3 sm:p-4">
              {loadingStates.eventDetails[selectedEventModal.id_evento] && !selectedEventModal.images?.length ? (
                <div className="h-64 flex items-center justify-center"><LoadingSpinner text="Cargando imágenes..." /></div>
              ) : selectedEventModal.images && selectedEventModal.images.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
                  {selectedEventModal.images.map((img, imgIdx) => (
                    <motion.div
                      key={img.id_evidencia || imgIdx}
                      className="group relative aspect-square rounded-md overflow-hidden bg-gray-700"
                      initial={{ opacity: 0, y:10 }} animate={{opacity:1, y:0}}
                      transition={{duration:0.3, delay: imgIdx * 0.03}}
                    >
                      <Image
                        src={img.imagen_url}
                        alt={img.nombre || selectedEventModal.nombre_evento}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        placeholder="blur"
                        blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                        onError={(e) => {e.target.onerror = null; e.target.src='/placeholder-image.jpg';}}
                        unoptimized={true}
                      />
                        {img.nombre && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <p className="text-white text-xs font-medium truncate">{img.nombre}</p>
                          </div>
                        )}
                    </motion.div>
                  ))}
                </div>
              ) : (
                   <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                      <ImageOff size={48} className="mb-3"/>
                      <p>No hay imágenes disponibles para este evento.</p>
                   </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}