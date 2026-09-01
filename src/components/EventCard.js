'use client';
import { memo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Calendar, Users, Clock, CheckCircle, XCircle, MapPin, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatearFechaMedia } from '@/lib/fechas';

function EventCard({ evento, isRegistered, onParticipate, onViewDetails, index }) {
  const router = useRouter();
  const [imageError, setImageError] = useState(false);

  const isEventFinished = evento.isPastEvent;
  const sinCupos = evento.cupos !== null && evento.cupos_disponibles <= 0;

  // El formateo vive en un helper compartido porque la fecha llega como DATE de
  // Postgres serializado a UTC y, formateada sin más, se imprime el día anterior.
  const fechaFormateada = formatearFechaMedia(evento.fecha);

  const getEventStatusInfo = () => {
    if (isEventFinished) {
      return {
        text: 'Finalizado',
        color: 'bg-slate-600/80 backdrop-blur-md',
        textColor: 'text-white',
        Icon: Clock,
        gradient: 'from-slate-500/20 to-slate-700/20'
      };
    }
    if (isRegistered) {
      return {
        text: 'Inscrito',
        color: 'bg-purple-500/80 backdrop-blur-md',
        textColor: 'text-white',
        Icon: CheckCircle,
        gradient: 'from-purple-500/20 to-purple-700/20'
      };
    }
    if (evento.registroCerrado) {
      return {
        text: 'Inscripciones Cerradas',
        color: 'bg-orange-500/80 backdrop-blur-md',
        textColor: 'text-white',
        Icon: XCircle,
        gradient: 'from-orange-500/20 to-orange-700/20'
      };
    }
    if (evento.cupos !== null && evento.cupos_disponibles <= 0) {
      return {
        text: 'Cupos Llenos',
        color: 'bg-red-500/80 backdrop-blur-md',
        textColor: 'text-white',
        Icon: XCircle,
        gradient: 'from-red-500/20 to-red-700/20'
      };
    }
    return {
      text: 'Disponible',
      color: 'bg-emerald-500/80 backdrop-blur-md',
      textColor: 'text-white',
      Icon: Sparkles,
      gradient: 'from-emerald-500/20 to-green-700/20'
    };
  };

  const statusInfo = getEventStatusInfo();

  const handleCardClick = () => {
    if (onViewDetails) {
      onViewDetails();
    } else if (evento?.id_evento) {
      router.push(`/eventos/${evento.id_evento}`);
    }
  };

  // Rótulo y estado del botón de inscripción. La tarjeta recibía
  // `onParticipate` desde /eventos pero no lo declaraba ni lo renderizaba: no
  // existía botón de inscripción en el listado y toda la maquinaria de registro
  // de esa página era código muerto.
  const accionInscripcion = (() => {
    if (isRegistered) return { texto: 'Ver mi inscripción', deshabilitado: false };
    if (isEventFinished) return { texto: 'Evento finalizado', deshabilitado: true };
    if (evento.registroCerrado) return { texto: 'Inscripciones cerradas', deshabilitado: true };
    if (sinCupos) return { texto: 'Sin cupos', deshabilitado: true };
    return { texto: 'Participar', deshabilitado: false };
  })();

  const getCuposDisplay = () => {
    if (evento.cupos === null) return 'Cupos ilimitados';

    const disponibles = evento.cupos_disponibles !== null
      ? Number(evento.cupos_disponibles)
      : Math.max(0, evento.cupos - (evento.asistentes_count || 0));

    const asistentes = evento.asistentes_count !== undefined
      ? evento.asistentes_count
      : (evento.cupos !== null && evento.cupos_disponibles !== null)
          ? evento.cupos - evento.cupos_disponibles
          : 0;

    const pocosDisponibles = disponibles > 0 && disponibles <= evento.cupos * 0.2;

    return (
      <span className="flex items-center">
        <span>{asistentes} / {evento.cupos}</span>
        {disponibles > 0 && (
          <span className={`ml-1.5 ${pocosDisponibles ? 'text-amber-400 font-medium' : 'text-gray-400'}`}>
            ({disponibles} disponibles{pocosDisponibles ? '!' : ''})
          </span>
        )}
      </span>
    );
  };

  // Solo animamos la entrada inicial con framer-motion (una vez), y limitamos
  // el stagger a las primeras 6 tarjetas. El resto del hover se maneja con
  // CSS group-hover, mucho más barato.
  const shouldAnimateEntry = index < 6;

  return (
    <motion.div
      initial={shouldAnimateEntry ? { opacity: 0, y: 16 } : false}
      animate={shouldAnimateEntry ? { opacity: 1, y: 0 } : false}
      transition={{
        duration: 0.4,
        delay: Math.min(index, 5) * 0.06,
        ease: 'easeOut'
      }}
      className="group relative bg-gradient-to-br from-gray-900/90 via-gray-900/95 to-black/90
                 rounded-2xl overflow-hidden shadow-2xl border border-gray-800/50
                 transition-transform duration-300 ease-out flex flex-col h-full cursor-pointer
                 hover:-translate-y-2"
      onClick={handleCardClick}
    >
      {/* Glow effect on hover */}
      <div className={`pointer-events-none absolute -inset-0.5 bg-gradient-to-r ${statusInfo.gradient}
                      rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

      {/* Card content */}
      <div className="relative h-full flex flex-col bg-gray-900/50 rounded-2xl">
        {/* Image section */}
        <div className="relative w-full pt-[56%] overflow-hidden rounded-t-2xl">
          {!imageError && evento.imagen_url ? (
            <>
              <Image
                src={evento.imagen_url}
                alt={evento.nombre_evento || 'Imagen del evento'}
                fill
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                priority={index < 3}
                loading={index < 3 ? 'eager' : 'lazy'}
                quality={75}
                onError={() => setImageError(true)}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent
                            opacity-80 group-hover:opacity-70 transition-opacity duration-300"></div>
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-850 to-gray-900
                          flex items-center justify-center">
              <div className="text-center p-4">
                <Sparkles className="mx-auto mb-2 text-gray-600" size={32} />
                <span className="text-gray-500 text-sm font-medium">
                  {evento.imagen_url ? 'Error al cargar' : 'Sin imagen'}
                </span>
              </div>
            </div>
          )}

          {/* Status badge */}
          <div
            className={`absolute top-4 right-4 text-xs font-semibold px-4 py-2 rounded-full
                       ${statusInfo.textColor} ${statusInfo.color} shadow-xl
                       flex items-center gap-2 border border-white/10`}
          >
            {statusInfo.Icon && <statusInfo.Icon size={14} />}
            {statusInfo.text}
          </div>

          {/* Event title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <h3
              className="text-xl sm:text-2xl font-bold text-white line-clamp-2 drop-shadow-2xl
                       group-hover:text-green-300 transition-colors duration-300"
              title={evento.nombre_evento}
            >
              {evento.nombre_evento}
            </h3>
          </div>
        </div>

        {/* Content section */}
        <div className="p-6 flex flex-col flex-grow">
          {/* Event details */}
          <div className="space-y-4">
            <div className="flex items-center text-gray-300 group-hover:text-green-300 transition-colors duration-300">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-green-500/10
                            group-hover:bg-green-500/20 transition-colors mr-3">
                <Calendar size={18} className="text-green-400" />
              </div>
              <span className="font-semibold text-sm">{fechaFormateada}</span>
            </div>

            <div className="flex items-center text-gray-300">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/10
                            group-hover:bg-blue-500/20 transition-colors mr-3">
                <Users size={18} className="text-blue-400" />
              </div>
              <div className="flex flex-wrap items-center text-sm">
                {getCuposDisplay()}
              </div>
            </div>

            {evento.ubicacion && (
              <div className="flex items-center text-gray-300">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-500/10
                              group-hover:bg-purple-500/20 transition-colors mr-3">
                  <MapPin size={18} className="text-purple-400" />
                </div>
                <span className="line-clamp-1 text-sm">{evento.ubicacion}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {evento.descripcion_corta && (
            <p className="text-sm text-gray-400 mt-5 line-clamp-2 leading-relaxed
                       group-hover:text-gray-300 transition-colors duration-300">
              {evento.descripcion_corta}
            </p>
          )}

          {/* Acciones. Son botones reales, no un adorno: antes el único destino
              posible de la tarjeta era el detalle, aunque /eventos ya tuviera
              todo el flujo de inscripción implementado. */}
          <div className="mt-auto flex items-center gap-2 pt-6">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCardClick();
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-line
                         px-4 py-2.5 text-sm font-medium text-muted transition-colors
                         hover:border-line-strong hover:text-fg"
            >
              Ver detalles
              <ArrowRight size={16} aria-hidden="true" />
            </button>

            {onParticipate && (
              <button
                type="button"
                disabled={accionInscripcion.deshabilitado}
                onClick={(e) => {
                  e.stopPropagation();
                  onParticipate();
                }}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-brand px-4 py-2.5
                           text-sm font-semibold text-bg transition-colors hover:bg-brand-strong
                           disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint"
              >
                {accionInscripcion.texto}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default memo(EventCard);
