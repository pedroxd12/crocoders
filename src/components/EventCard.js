'use client';
import { useState } from 'react';
import Image from 'next/image';
// Ya no se necesita useAuth, usePathname ni toast para la lógica de clic principal.
// Se pueden mantener si se usan para otras cosas, pero para este cambio específico no son necesarios.
// import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation'; 
// import { toast } from 'react-toastify';
import { Calendar, Users, Clock, CheckCircle, XCircle, MapPin } from 'lucide-react';

export default function EventCard({ evento, isRegistered, index }) {
  // const { isAuthenticated } = useAuth(); // Ya no es necesario para la lógica de clic
  const router = useRouter();
  // const pathname = usePathname(); // Ya no es necesario para la lógica de clic

  const [imageError, setImageError] = useState(false);

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
        color: 'bg-slate-500/90', 
        textColor: 'text-white',
        Icon: Clock,
      };
    }
    if (isRegistered) {
      return { 
        text: 'Inscrito', 
        color: 'bg-purple-500/90', 
        textColor: 'text-white',
        Icon: CheckCircle,
      };
    }
    if (evento.cupos !== null && evento.cupos_disponibles <= 0) {
      return { 
        text: 'Cupos Llenos', 
        color: 'bg-red-500/90', 
        textColor: 'text-white',
        Icon: XCircle,
      };
    }
    return { 
      text: 'Disponible', 
      color: 'bg-emerald-500/90', 
      textColor: 'text-white',
      Icon: null, // Puedes poner un icono como Sparkles si quieres
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
    <div
      className={`group bg-gradient-to-bl from-gray-800/80 to-gray-900/95 rounded-xl overflow-hidden shadow-lg 
                border border-gray-700/30 transition-all duration-300 flex flex-col h-full cursor-pointer
                hover:shadow-xl hover:shadow-green-500/15 hover:border-green-500/30 transform hover:-translate-y-1
                animate-in fade-in-0 slide-in-from-bottom-5 duration-500 ease-out`}
      onClick={handleCardClick} // Llama a la función modificada
      // El estilo de animación con delay se mantiene, pero podrías quitarlo si la carga es muy rápida
      // style={{ animationDelay: `${index * 50}ms` }} 
      // Opcional: quitar el delay para que todas las tarjetas aparezcan más rápido o al mismo tiempo si `animate-in` es suficiente
    >
      {/* Imagen con overlay gradiente */}
      <div className="relative w-full pt-[52%] overflow-hidden"> 
        {!imageError && evento.imagen_url ? (
          <>
            <Image
              src={evento.imagen_url}
              alt={evento.nombre_evento || 'Imagen del evento'}
              fill
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={index < 3} // Priorizar carga de las primeras imágenes visibles
              quality={85}
              onError={() => {
                console.warn(`Error cargando imagen: ${evento.imagen_url}`);
                setImageError(true);
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent opacity-70 group-hover:opacity-60 transition-opacity"></div>
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
            <span className="text-gray-400 text-sm font-medium">
              {evento.imagen_url ? 'Error al cargar imagen' : 'Sin imagen disponible'}
            </span>
          </div>
        )}
        
        <div className={`absolute top-3 right-3 text-xs font-medium px-3 py-1.5 rounded-full 
                         ${statusInfo.textColor} ${statusInfo.color} shadow-lg backdrop-blur-sm 
                         flex items-center transition-all group-hover:scale-105`}>
          {statusInfo.Icon && <statusInfo.Icon size={14} className="mr-1.5" />}
          {statusInfo.text}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 
            className="text-lg sm:text-xl font-bold text-white line-clamp-2 drop-shadow-md group-hover:text-green-200 transition-colors"
            title={evento.nombre_evento}
          >
            {evento.nombre_evento}
          </h3>
        </div>
      </div>
      
      <div className="p-5 flex flex-col flex-grow">
        <div className="text-sm text-gray-300 space-y-3.5">
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
        
        {evento.descripcion_corta && (
          <p className="text-sm text-gray-400 mt-4 line-clamp-2 group-hover:text-gray-300 transition-colors">
            {evento.descripcion_corta}
          </p>
        )}
        
        <div className="mt-auto pt-4 flex items-center justify-center">
          <div className={`w-12 h-1 mt-2 rounded-full bg-gray-700/50 group-hover:bg-green-500/50 transition-all duration-300 group-hover:w-24`}></div>
        </div>
      </div>
    </div>
  );
}