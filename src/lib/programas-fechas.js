// Fechas y horarios del módulo de programas.
//
// EL PORQUÉ (esto causaba "Invalid Date" en toda la tabla de sesiones):
// `programa_recurrente.fecha_inicio/fecha_fin` y `sesion_programa.fecha` son de
// tipo DATE. node-pg convierte ese tipo a un objeto Date y NextResponse.json lo
// serializa como instante ISO completo ("2026-09-01T06:00:00.000Z"). Por eso:
//   - `new Date(`${row.fecha}T00:00:00`)` producía "…000ZT00:00:00" → Invalid Date.
//   - `new Date(row.fecha).toLocaleDateString()` pintaba el día ANTERIOR en
//     cualquier navegador al oeste de UTC (el servidor de Vercel corre en UTC).
//
// La conversión día-de-calendario ↔ Date local vive en `@/lib/fechas`, que es la
// misma que usa el módulo de eventos: aquí NO se reimplementa, solo se le pone
// el nombre con el que la consume esta parte del código y se añade lo que es
// propio de los programas (rango del periodo, días de la semana, horas cortas).

import { aDiaISO, aFechaLocal, formatearFechaMedia, formatearHora as formatearHoraBase } from './fechas';

/** Normaliza a 'YYYY-MM-DD' venga como venga (string plano, ISO o Date de pg). */
export const aFechaISO = aDiaISO;

/** Date a medianoche LOCAL del día indicado (sin el desfase de zona horaria). */
export const fechaLocal = aFechaLocal;

/** Fecha lista para pintar. `opciones` acepta lo de toLocaleDateString. */
export function formatearFecha(valor, opciones, fallback = '—') {
  if (!opciones) return formatearFechaMedia(valor, fallback);
  const d = aFechaLocal(valor);
  if (!d) return fallback;
  return d.toLocaleDateString('es-MX', opciones);
}

/** Rango "1 sep 2026 – 30 sep 2026" para cabeceras y listados. */
export function formatearRango(inicio, fin) {
  const a = formatearFechaMedia(inicio, null);
  const b = formatearFechaMedia(fin, null);
  if (!a && !b) return '—';
  if (!b) return a;
  if (!a) return b;
  return `${a} – ${b}`;
}

/** 'HH:MM' a partir de un TIME de Postgres ('HH:MM:SS'). Lo que pide <input type="time">. */
export function aHoraCorta(valor) {
  if (!valor) return '';
  return String(valor).slice(0, 5);
}

/** '04:00 p.m.' a partir de 'HH:MM[:SS]'. Cadena vacía si no hay hora. */
export function formatearHora(valor) {
  return formatearHoraBase(valor, '');
}

/** true si el rango está invertido. `programa_recurrente` no tiene CHECK de fechas. */
export function rangoFechasInvalido(fechaInicio, fechaFin) {
  const a = aDiaISO(fechaInicio);
  const b = aDiaISO(fechaFin);
  if (!a || !b) return false;
  return b < a; // comparación lexicográfica válida en 'YYYY-MM-DD'
}

// Etiquetas de los días tal y como los guarda `dias_semana` (0=Domingo … 6=Sábado,
// el mismo criterio que getUTCDay(), que es el que usa el generador de sesiones).
export const DIAS_SEMANA_LABELS = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
];

// Orden de presentación: la semana empieza en lunes para el usuario.
export const DIAS_SEMANA_OPCIONES = [1, 2, 3, 4, 5, 6, 0].map((value) => ({
  value,
  label: DIAS_SEMANA_LABELS[value],
}));

/** "Lunes, Miércoles" a partir del array `dias_semana`. */
export function formatearDiasSemana(dias) {
  if (!Array.isArray(dias) || dias.length === 0) return null;
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((d) => dias.includes(d))
    .map((d) => DIAS_SEMANA_LABELS[d])
    .join(', ');
}
