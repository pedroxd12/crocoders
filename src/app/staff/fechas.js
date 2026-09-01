import { combinarFechaHora } from '@/lib/fechas';

/**
 * Situación temporal de un evento dentro del panel de staff.
 *
 * El panel marcaba TODOS los eventos como "Finalizado" y los contadores
 * "En curso" y "Próximos" daban siempre 0. La causa: `fecha_inicio` es una
 * columna `date`, pg la convierte en Date y NextResponse.json la serializaba
 * como ISO completo ("2026-08-31T06:00:00.000Z"); el cliente la concatenaba
 * con la hora y construía "2026-08-31T06:00:00.000ZT18:00:00" → Invalid Date.
 * Toda comparación con NaN es false, así que siempre se caía en el último
 * `return`.
 *
 * El formateo y la combinación fecha+hora viven en `@/lib/fechas`, que es donde
 * se resolvió el mismo desfase para el resto del sitio. Aquí sólo queda la
 * clasificación, que es lo propio del panel.
 */

/** El tono corresponde a los de <Badge>. */
export function estadoTemporal(evento) {
  const inicio = combinarFechaHora(evento?.fecha_inicio, evento?.hora_inicio);
  const fin = combinarFechaHora(evento?.fecha_fin, evento?.hora_fin, { finDelDia: true });

  // Sin fechas utilizables NO se afirma "Finalizado": se dice que se desconoce,
  // que es justo el error que hacía parecer terminado un evento del mes que viene.
  if (!inicio || !fin) return { label: 'Fecha sin definir', tone: 'neutral' };

  const ahora = new Date();
  if (ahora < inicio) return { label: 'Próximo', tone: 'info' };
  if (ahora <= fin) return { label: 'En curso', tone: 'success' };
  return { label: 'Finalizado', tone: 'neutral' };
}

/** ¿El evento está ocurriendo ahora mismo? */
export function estaEnCurso(evento) {
  return estadoTemporal(evento).label === 'En curso';
}

/** ¿El evento aún no ha empezado? */
export function esProximo(evento) {
  return estadoTemporal(evento).label === 'Próximo';
}
