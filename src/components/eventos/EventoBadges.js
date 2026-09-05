'use client';

import { ocupacionDeEvento } from '@/lib/aforo';

/**
 * Los DOS sistemas de etiqueta de un evento, separados a propósito:
 *
 *  - `EstadoBadge` (SÓLIDO, mapeo de color fijo): comunica el estado de la
 *    inscripción — disponible=verde, inscrito=azul, cerrado=ámbar, lleno=rojo,
 *    finalizado=gris. Mismo tamaño siempre, sin iconos.
 *  - `CategoriaTag` (OUTLINE sutil): comunica la categoría (Concurso, Taller,
 *    "Equipos de 2–5"…). Nunca lleva color de estado.
 *
 * Antes cada pantalla inventaba su pastilla (sólida con reloj en la tarjeta,
 * outline verde/rojo en el detalle, verde con estrellitas en "Disponible") y
 * estado y categoría eran indistinguibles a simple vista.
 */

const ESTADOS = {
  disponible: { label: 'Disponible', cls: 'bg-brand text-bg' },
  inscrito: { label: 'Inscrito', cls: 'bg-info text-bg' },
  cerrado: { label: 'Inscripciones cerradas', cls: 'bg-warning text-bg' },
  lleno: { label: 'Cupos llenos', cls: 'bg-danger text-white' },
  finalizado: { label: 'Finalizado', cls: 'bg-surface-3 text-muted' },
};

/**
 * Deriva el estado visible de un evento ya procesado por la UI
 * (isPastEvent/registroCerrado calculados). El orden importa: un evento
 * terminado es "finalizado" aunque el usuario esté inscrito.
 */
export function estadoDeEvento(evento, isRegistered = false) {
  if (evento?.isPastEvent) return 'finalizado';
  if (isRegistered) return 'inscrito';
  if (evento?.registroCerrado) return 'cerrado';
  if (ocupacionDeEvento(evento).lleno) return 'lleno';
  return 'disponible';
}

export function EstadoBadge({ estado, className = '' }) {
  const info = ESTADOS[estado] || ESTADOS.disponible;
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-lg ${info.cls} ${className}`}
    >
      {info.label}
    </span>
  );
}

/**
 * Texto del tamaño de equipo, redactado en un solo sitio para que la tarjeta,
 * el hero del detalle y el formulario digan exactamente lo mismo. "3–3" o
 * "3–∞" no son un texto: si min y max coinciden se dice el número una vez, y
 * sin máximo se dice "o más".
 */
export function rangoEquipos(min, max) {
  const minimo = Number(min) || 1;
  const maximo = Number(max) || null;
  if (!maximo) return `Equipos de ${minimo} o más integrantes`;
  if (minimo === maximo) return `Equipos de ${minimo} integrantes`;
  return `Equipos de ${minimo} a ${maximo} integrantes`;
}

export function CategoriaTag({ children, className = '' }) {
  if (!children) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md border border-line-strong bg-bg/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted ${className}`}
    >
      {children}
    </span>
  );
}
