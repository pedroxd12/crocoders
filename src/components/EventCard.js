'use client';
import { memo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Calendar, Users, MapPin, ArrowRight, ImageOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatearFechaMedia } from '@/lib/fechas';
import { EstadoBadge, CategoriaTag, estadoDeEvento, rangoEquipos } from '@/components/eventos/EventoBadges';
import Button from '@/components/ui/Button';

/**
 * Fila de dato del evento. Un solo tratamiento de iconografía (cajita con
 * fondo suave) y una paleta SEMÁNTICA fija compartida con el detalle:
 * fecha → brand, aforo → info, ubicación → accent. Antes tarjeta, detalle y
 * recuadros usaban tres tratamientos y colores decorativos distintos.
 */
const TONOS_DATO = {
  brand: 'bg-brand-soft text-brand',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent/10 text-accent',
};

function DatoEvento({ icon: Icon, tone, children }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONOS_DATO[tone]}`}>
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function EventCard({ evento, isRegistered, onParticipate, onViewDetails, index }) {
  const router = useRouter();
  const [imageError, setImageError] = useState(false);

  const isEventFinished = evento.isPastEvent;
  const sinCupos = evento.cupos !== null && evento.cupos_disponibles <= 0;
  const estado = estadoDeEvento(evento, isRegistered);

  // ¿Concurso por equipos? Entonces la inscripción NO es el flujo individual
  // genérico: el botón lo dice y el clic lleva al detalle, donde vive el
  // formulario de equipo. Mismas tres condiciones que usa el detalle.
  const esConcursoEquipos = Boolean(
    evento.permite_equipos && evento.id_concurso && evento.modalidad === 'equipos',
  );

  // El formateo vive en un helper compartido porque la fecha llega como DATE de
  // Postgres serializado a UTC y, formateada sin más, se imprime el día anterior.
  const fechaFormateada = formatearFechaMedia(evento.fecha);

  const handleCardClick = () => {
    if (onViewDetails) {
      onViewDetails();
    } else if (evento?.id_evento) {
      router.push(`/eventos/${evento.id_evento}`);
    }
  };

  const accionInscripcion = (() => {
    if (isRegistered) return { texto: 'Ver mi inscripción', deshabilitado: false };
    if (isEventFinished) return { texto: 'Evento finalizado', deshabilitado: true };
    if (evento.registroCerrado) return { texto: 'Inscripciones cerradas', deshabilitado: true };
    if (sinCupos) return { texto: 'Sin cupos', deshabilitado: true };
    return { texto: 'Participar', deshabilitado: false };
  })();

  // Aforo en términos de OCUPACIÓN ("3 inscritos de 150"), no de disponibilidad:
  // "147/150 disponibles" con barra llena comunicaba justo lo contrario.
  // `lugares_ocupados` cuenta personas (un equipo = N lugares).
  const getCuposDisplay = () => {
    if (evento.cupos === null) return <span>Cupos ilimitados</span>;

    const cupos = Number(evento.cupos);
    const ocupados = evento.lugares_ocupados != null
      ? Number(evento.lugares_ocupados)
      : Math.max(0, cupos - Number(evento.cupos_disponibles ?? cupos));
    const libres = Math.max(0, cupos - ocupados);
    const pocosDisponibles = libres > 0 && libres <= cupos * 0.2;

    return (
      <span className="flex flex-wrap items-center gap-x-1.5">
        <span className="text-fg font-medium">{ocupados}</span>
        <span>de {cupos} inscritos</span>
        {pocosDisponibles && (
          <span className="font-medium text-warning">· ¡Quedan {libres}!</span>
        )}
        {libres === 0 && <span className="font-medium text-danger">· Lleno</span>}
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
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl
                 border border-line bg-surface shadow-xl transition-all duration-300 ease-out
                 hover:-translate-y-1.5 hover:border-line-strong"
      onClick={handleCardClick}
    >
      {/* Imagen: el flyer vive contenido aquí, sin texto encima. El título ya
          no se superpone al arte del banner (se pisaba con el texto del propio
          flyer y quedaba ilegible). Solo el badge de ESTADO flota sobre ella. */}
      <div className="relative w-full overflow-hidden bg-surface-2 pt-[52%]">
        {!imageError && evento.imagen_url ? (
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
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="p-4 text-center">
              <ImageOff className="mx-auto mb-2 text-faint" size={28} aria-hidden="true" />
              <span className="text-sm font-medium text-faint">
                {evento.imagen_url ? 'Error al cargar' : 'Sin imagen'}
              </span>
            </div>
          </div>
        )}

        <div className="absolute right-3 top-3">
          <EstadoBadge estado={estado} />
        </div>
      </div>

      {/* Contenido */}
      <div className="flex flex-grow flex-col p-5">
        {/* Tags de categoría: outline, nunca con color de estado. */}
        <div className="flex flex-wrap gap-1.5">
          {evento.tipo && <CategoriaTag>{evento.tipo}</CategoriaTag>}
          {esConcursoEquipos && (
            <CategoriaTag>
              {rangoEquipos(evento.min_integrantes_equipo, evento.max_integrantes_equipo)}
            </CategoriaTag>
          )}
          {evento.total_retos > 0 && (
            <CategoriaTag>
              {evento.total_retos} {evento.total_retos === 1 ? 'desafío' : 'desafíos'}
            </CategoriaTag>
          )}
        </div>

        <h3
          className="mt-2.5 text-lg font-bold leading-snug text-fg line-clamp-2 transition-colors
                     group-hover:text-brand sm:text-xl"
          title={evento.nombre_evento}
        >
          {evento.nombre_evento}
        </h3>

        <div className="mt-4 space-y-3">
          <DatoEvento icon={Calendar} tone="brand">
            <span className="font-medium text-fg">{fechaFormateada}</span>
          </DatoEvento>

          <DatoEvento icon={Users} tone="info">{getCuposDisplay()}</DatoEvento>

          {evento.ubicacion && (
            <DatoEvento icon={MapPin} tone="accent">
              <span className="line-clamp-1">{evento.ubicacion}</span>
            </DatoEvento>
          )}
        </div>

        {evento.descripcion_corta && (
          <p className="mt-4 text-sm leading-relaxed text-muted line-clamp-2">
            {evento.descripcion_corta}
          </p>
        )}

        {/* Acciones con las primitivas del sistema: mismo radio, alto y peso
            tipográfico que el resto de botones de la app. */}
        <div className="mt-auto flex items-center gap-2 pt-5">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick();
            }}
          >
            Ver detalles
            <ArrowRight size={16} aria-hidden="true" />
          </Button>

          {/* En concursos por equipos NO hay botón de inscripción en la
              tarjeta: el formulario de equipo vive en el detalle, así que
              "Ver detalles" es la única acción y el botón extra sólo repetía
              ese mismo destino. */}
          {onParticipate && !esConcursoEquipos && (
            <Button
              variant="primary"
              className="flex-1"
              disabled={accionInscripcion.deshabilitado}
              onClick={(e) => {
                e.stopPropagation();
                onParticipate();
              }}
            >
              {accionInscripcion.texto}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default memo(EventCard);
