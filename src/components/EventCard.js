'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation'; 
import { Calendar, Users, Clock, CheckCircle, XCircle, MapPin, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function EventCard({ evento, isRegistered, index }) {
  const router = useRouter();
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isEventFinished = evento.isPastEvent;

  const fechaFormateada = evento.fecha 
    ? new Date(evento.fecha + 'T00:00:00').toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }) 
    : 'Fecha N/A';

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

  // Lógica de clic modificada
  const handleCardClick = () => {
    // Siempre navega a la página de detalles del evento
    if (evento && evento.id_evento) {
      router.push(`/eventos/${evento.id_evento}`);
    } else {
      console.error("Error: ID de evento no disponible en EventCard.");
      // Opcionalmente, mostrar un toast de error si el ID no está disponible
      // toast.error("No se pudo cargar el detalle del evento.", { theme: "dark" });
    }
  };

  const getCuposDisplay = () => {
    if (evento.cupos === null) return 'Cupos ilimitados';
    
    const asistentes = evento.asistentes_count || 0;
    const disponibles = evento.cupos_disponibles !== null 
      ? evento.cupos_disponibles 
      : Math.max(0, evento.cupos - asistentes);
    
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.5, 
        delay: index * 0.1,
        ease: [0.25, 0.4, 0.25, 1]
      }}
      whileHover={{ y: -8 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative bg-gradient-to-br from-gray-900/90 via-gray-900/95 to-black/90 
                 rounded-2xl overflow-hidden shadow-2xl border border-gray-800/50
                 transition-all duration-500 flex flex-col h-full cursor-pointer backdrop-blur-sm"
      onClick={handleCardClick}
    >
      {/* Glow effect on hover */}
      <div className={`absolute -inset-0.5 bg-gradient-to-r ${statusInfo.gradient} 
                      rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
      
      {/* Card content */}
      <div className="relative h-full flex flex-col bg-gray-900/50 rounded-2xl backdrop-blur-sm">
        {/* Image section */}
        <div className="relative w-full pt-[56%] overflow-hidden rounded-t-2xl"> 
          {!imageError && evento.imagen_url ? (
            <>
              <Image
                src={evento.imagen_url}
                alt={evento.nombre_evento || 'Imagen del evento'}
                fill
                className="object-cover transition-all duration-700 ease-out group-hover:scale-110 group-hover:rotate-1"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                priority={index < 3}
                quality={90}
                onError={() => {
                  console.warn(`Error cargando imagen: ${evento.imagen_url}`);
                  setImageError(true);
                }}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent 
                            opacity-80 group-hover:opacity-70 transition-opacity duration-500"></div>
              
              {/* Animated gradient accent */}
              <motion.div 
                className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500"
                style={{
                  background: `linear-gradient(135deg, transparent 0%, ${
                    isEventFinished ? '#64748b' : 
                    isRegistered ? '#a855f7' : 
                    evento.cupos !== null && evento.cupos_disponibles <= 0 ? '#ef4444' : 
                    '#10b981'
                  } 50%, transparent 100%)`
                }}
              />
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
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 + 0.2 }}
            className={`absolute top-4 right-4 text-xs font-semibold px-4 py-2 rounded-full 
                       ${statusInfo.textColor} ${statusInfo.color} shadow-xl
                       flex items-center gap-2 border border-white/10`}
          >
            {statusInfo.Icon && (
              <motion.div
                animate={{ rotate: isHovered ? 360 : 0 }}
                transition={{ duration: 0.6 }}
              >
                <statusInfo.Icon size={14} />
              </motion.div>
            )}
            {statusInfo.text}
          </motion.div>

          {/* Event title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <motion.h3 
              className="text-xl sm:text-2xl font-bold text-white line-clamp-2 drop-shadow-2xl
                       group-hover:text-green-300 transition-colors duration-300"
              title={evento.nombre_evento}
              animate={{ x: isHovered ? 4 : 0 }}
              transition={{ duration: 0.3 }}
            >
              {evento.nombre_evento}
            </motion.h3>
          </div>
        </div>
        
        {/* Content section */}
        <div className="p-6 flex flex-col flex-grow">
          {/* Event details */}
          <div className="space-y-4">
            <motion.div 
              className="flex items-center text-gray-300 group-hover:text-green-300 transition-colors duration-300"
              whileHover={{ x: 4 }}
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-green-500/10 
                            group-hover:bg-green-500/20 transition-colors mr-3">
                <Calendar size={18} className="text-green-400" />
              </div>
              <span className="font-semibold text-sm">{fechaFormateada}</span>
            </motion.div>
            
            <motion.div 
              className="flex items-center text-gray-300"
              whileHover={{ x: 4 }}
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/10 
                            group-hover:bg-blue-500/20 transition-colors mr-3">
                <Users size={18} className="text-blue-400" />
              </div>
              <div className="flex flex-wrap items-center text-sm">
                {getCuposDisplay()}
              </div>
            </motion.div>

            {evento.ubicacion && (
              <motion.div 
                className="flex items-center text-gray-300"
                whileHover={{ x: 4 }}
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-500/10 
                              group-hover:bg-purple-500/20 transition-colors mr-3">
                  <MapPin size={18} className="text-purple-400" />
                </div>
                <span className="line-clamp-1 text-sm">{evento.ubicacion}</span>
              </motion.div>
            )}
          </div>
          
          {/* Description */}
          {evento.descripcion_corta && (
            <motion.p 
              className="text-sm text-gray-400 mt-5 line-clamp-2 leading-relaxed
                       group-hover:text-gray-300 transition-colors duration-300"
              animate={{ opacity: isHovered ? 1 : 0.8 }}
            >
              {evento.descripcion_corta}
            </motion.p>
          )}
          
          {/* Bottom action indicator */}
          <div className="mt-auto pt-6 flex items-center justify-between">
            <motion.div 
              className="h-1 rounded-full bg-gradient-to-r from-green-500/50 to-emerald-500/50"
              initial={{ width: '2rem' }}
              animate={{ width: isHovered ? '4rem' : '2rem' }}
              transition={{ duration: 0.3 }}
            />
            <motion.div
              animate={{ x: isHovered ? 4 : 0, opacity: isHovered ? 1 : 0.5 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 text-green-400 text-sm font-medium"
            >
              Ver detalles
              <ArrowRight size={16} />
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}