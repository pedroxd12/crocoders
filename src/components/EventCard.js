'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'react-toastify';
import { Calendar, Users, ArrowRight, Clock, CheckCircle, XCircle, MapPin, Loader } from 'lucide-react';
import { motion } from 'framer-motion';
import Button from './ui/Button';

export default function EventCard({ evento, isRegistered, onParticipate, onViewDetails, index }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [actionLoading, setActionLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Usar la propiedad precalculada por el componente padre
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
        color: 'bg-slate-500', 
        textColor: 'text-slate-200',
        Icon: Clock, 
        buttonDisabled: true, 
        actionText: "Ver Detalles" 
      };
    }
    if (isRegistered) {
      return { 
        text: 'Inscrito', 
        color: 'bg-purple-500', 
        textColor: 'text-purple-100',
        Icon: CheckCircle, 
        buttonDisabled: false, 
        actionText: "Ver Detalles / Cancelar" 
      };
    }
    if (evento.cupos !== null && evento.cupos_disponibles <= 0) {
      return { 
        text: 'Cupos Llenos', 
        color: 'bg-red-500', 
        textColor: 'text-red-100',
        Icon: XCircle, 
        buttonDisabled: true, 
        actionText: "Cupos Llenos" 
      };
    }
    return { 
      text: 'Disponible', 
      color: 'bg-emerald-500', 
      textColor: 'text-emerald-100',
      Icon: null, 
      buttonDisabled: false, 
      actionText: "Inscribirme / Ver Detalles" 
    };
  };

  const statusInfo = getEventStatusInfo();

  const handleMainAction = async (e) => {
    e.stopPropagation();

    if (isEventFinished || (isRegistered && !isEventFinished) || (!isRegistered && statusInfo.buttonDisabled)) {
      onViewDetails(evento.id_evento);
      return;
    }
    
    if (!isAuthenticated) {
      const currentFullURL = `${pathname}${window.location.search}`;
      router.push(`/iniciar?registerEvent=${evento.id_evento}&from=${encodeURIComponent(currentFullURL)}`);
      return;
    }

    if (typeof onParticipate === 'function') {
      setActionLoading(true);
      try {
        await onParticipate(evento);
      } catch (error) {
        console.error("Error en EventCard al llamar onParticipate:", error);
        toast.error(error.message || "Ocurrió un error.", { theme: "dark" });
      } finally {
        setActionLoading(false);
      }
    } else {
      onViewDetails(evento.id_evento);
    }
  };

  const handleCardClick = () => {
    onViewDetails(evento.id_evento);
  };

  // Calcular si hay pocos cupos disponibles (menos del 20%)
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
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg border border-gray-700/60 
                transition-all duration-300 flex flex-col h-full cursor-pointer hover:shadow-xl hover:shadow-green-500/10"
      onClick={handleCardClick}
    >
      {/* Imagen con overlay gradiente */}
      <div className="relative w-full pt-[56.25%] overflow-hidden"> 
        {!imageError && evento.imagen_url ? (
          <>
            <Image
              src={evento.imagen_url}
              alt={evento.nombre_evento || 'Imagen del evento'}
              fill
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={index < 3}
              quality={80}
              onError={() => {
                console.warn(`Error cargando imagen: ${evento.imagen_url}`);
                setImageError(true);
              }}
            />
            {/* Overlay con gradiente sutil */}
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent"></div>
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
            <span className="text-gray-400 text-sm font-medium">
              {evento.imagen_url ? 'Error al cargar imagen' : 'Sin imagen disponible'}
            </span>
          </div>
        )}
        
        {/* Badge de estado */}
        <div className={`absolute top-3 right-3 text-xs font-medium px-3 py-1.5 rounded-full ${statusInfo.textColor} ${statusInfo.color} shadow-md backdrop-blur-sm flex items-center`}>
          {statusInfo.Icon && <statusInfo.Icon size={14} className="mr-1.5" />}
          {statusInfo.text}
        </div>

        {/* Título sobre la imagen */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 
            className="text-lg sm:text-xl font-bold text-white line-clamp-2 drop-shadow-md group-hover:text-green-200 transition-colors"
            title={evento.nombre_evento}
          >
            {evento.nombre_evento}
          </h3>
        </div>
      </div>
      
      {/* Contenido de la tarjeta */}
      <div className="p-5 flex flex-col flex-grow">
        {/* Metadata del evento */}
        <div className="text-sm text-gray-300 space-y-3 mb-4">
          <div className="flex items-center group-hover:text-green-300 transition-colors">
            <Calendar size={16} className="mr-2.5 text-green-400 flex-shrink-0" />
            <span className="font-medium">{fechaFormateada}</span>
          </div>
          
          <div className="flex items-center">
            <Users size={16} className="mr-2.5 text-green-400 flex-shrink-0" />
            <div className="flex flex-wrap items-center">
              {getCuposDisplay()}
            </div>
          </div>

          {evento.ubicacion && (
            <div className="flex items-center">
              <MapPin size={16} className="mr-2.5 text-green-400 flex-shrink-0" />
              <span className="line-clamp-1">{evento.ubicacion}</span>
            </div>
          )}
        </div>
        
        {/* Descripción corta si existe */}
        {evento.descripcion_corta && (
          <p className="text-sm text-gray-400 mb-4 line-clamp-2">
            {evento.descripcion_corta}
          </p>
        )}
        
        {/* Botón de acción */}
        <div className="mt-auto pt-4 border-t border-gray-700/40">
          <Button 
            onClick={handleMainAction}
            variant={isRegistered && !isEventFinished ? "secondary" : (statusInfo.buttonDisabled ? "disabled" : "primary")}
            className="w-full text-sm py-2.5 font-medium"
            disabled={actionLoading || (statusInfo.buttonDisabled && !isRegistered)}
            loading={actionLoading}
          >
            {actionLoading ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <span className="flex items-center justify-center">
                {statusInfo.actionText}
                <ArrowRight size={16} className="ml-2 transition-transform group-hover:translate-x-1" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}