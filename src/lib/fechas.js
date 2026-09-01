// Formato de fechas de eventos.
//
// PORQUÉ EXISTE ESTE ARCHIVO
// --------------------------
// Las columnas `fecha_inicio` / `fecha_fin` son DATE en Postgres (un día del
// calendario, sin hora ni zona). El driver `pg` las convierte en un objeto Date
// y `NextResponse.json()` las serializa con toJSON(), así que al cliente llegan
// como "2026-09-15T00:00:00.000Z". Si el navegador hace
// `new Date("2026-09-15T00:00:00.000Z").toLocaleDateString()` en México (UTC-6)
// obtiene el 14 de septiembre a las 18:00 y IMPRIME EL DÍA ANTERIOR.
//
// La regla, entonces, es: quedarse con el día del calendario tal cual viene
// (los 10 primeros caracteres) y reconstruir la fecha a MEDIANOCHE LOCAL. Sin
// el sufijo "T00:00:00" una cadena "YYYY-MM-DD" también se interpreta como UTC
// y el desfase vuelve.
//
// Todas las vistas de eventos deben formatear a través de estas funciones en
// lugar de repetir `new Date(x).toLocaleDateString()`, que es justamente lo que
// producía el bug en cinco pantallas distintas.

const LOCALE = 'es-MX';

/**
 * Extrae el día del calendario ("YYYY-MM-DD") de cualquiera de las formas en
 * que una fecha puede llegar del API: ISO completo, "YYYY-MM-DD" a secas o un
 * objeto Date.
 */
export function aDiaISO(valor) {
  if (!valor) return null;

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const texto = String(valor);
  const match = texto.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const parsed = new Date(texto);
  return Number.isNaN(parsed.getTime()) ? null : aDiaISO(parsed);
}

/** Devuelve un Date situado a medianoche LOCAL del día indicado. */
export function aFechaLocal(valor) {
  const dia = aDiaISO(valor);
  if (!dia) return null;
  const fecha = new Date(`${dia}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Fecha corta para tablas y tarjetas: "15/09/2026".
 * `respaldo` es lo que se pinta cuando no hay fecha (por defecto un guion, no
 * "Invalid Date" ni una cadena vacía que descuadre la columna).
 */
export function formatearFechaDia(valor, respaldo = '—') {
  const fecha = aFechaLocal(valor);
  if (!fecha) return respaldo;
  return fecha.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Fecha media para tarjetas del sitio público: "15 sep 2026". */
export function formatearFechaMedia(valor, respaldo = 'Fecha por confirmar') {
  const fecha = aFechaLocal(valor);
  if (!fecha) return respaldo;
  return fecha.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Fecha completa para la ficha del evento: "martes, 15 de septiembre de 2026". */
export function formatearFechaLarga(valor, respaldo = 'Fecha por confirmar') {
  const fecha = aFechaLocal(valor);
  if (!fecha) return respaldo;
  return fecha.toLocaleDateString(LOCALE, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Hora "HH:MM[:SS]" de Postgres a "09:30 a.m.".
 * No pasa por `new Date(hora)` (que falla) sino por una fecha auxiliar.
 */
export function formatearHora(hora, respaldo = '—') {
  if (!hora) return respaldo;
  const [h, m] = String(hora).split(':');
  const horas = Number.parseInt(h, 10);
  const minutos = Number.parseInt(m ?? '0', 10);
  if (Number.isNaN(horas) || Number.isNaN(minutos)) return respaldo;
  const aux = new Date();
  aux.setHours(horas, minutos, 0, 0);
  return aux.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Marca de tiempo real (fecha_limite_registro, fecha de escaneo…). Aquí sí hay
 * hora, así que se respeta el instante tal cual y NO se recorta a día.
 */
export function formatearFechaHora(valor, respaldo = '—') {
  if (!valor) return respaldo;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return respaldo;
  return fecha.toLocaleString(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Une el día y la hora de un evento en un instante local, para comparar contra
 * `new Date()` (¿ya empezó?, ¿ya terminó?) sin arrastrar el desfase de UTC.
 * Si no hay hora se asume el final del día, que es lo que quiere decir "el
 * evento dura todo ese día".
 */
export function combinarFechaHora(fechaValor, hora, { finDelDia = false } = {}) {
  const fecha = aFechaLocal(fechaValor);
  if (!fecha) return null;
  if (hora) {
    const [h, m] = String(hora).split(':');
    fecha.setHours(Number.parseInt(h, 10) || 0, Number.parseInt(m, 10) || 0, finDelDia ? 59 : 0, finDelDia ? 999 : 0);
  } else if (finDelDia) {
    fecha.setHours(23, 59, 59, 999);
  }
  return fecha;
}
