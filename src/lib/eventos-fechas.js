// Convención de fechas y horas de los eventos. Léase antes de tocar cualquier
// consulta que compare un evento contra "ahora".
//
// EL PROBLEMA: `evento.fecha_limite_registro` es `timestamp without time zone`,
// y `fecha_inicio`/`fecha_fin` son `date` con `hora_inicio`/`hora_fin` como
// `time`. Todos son valores SIN zona horaria. El panel los captura con inputs
// `datetime-local`/`date`/`time`, es decir en hora local de México, y se
// guardan tal cual. Pero al leerlos, el driver de Postgres los convertía a Date
// usando la zona del proceso Node, que en Vercel es UTC: las 18:00 que escribió
// el administrador se interpretaban como 18:00Z = 12:00 en México. El registro
// se cerraba seis horas antes de lo anunciado.
//
// LA CONVENCIÓN (una sola, para guardar, leer y comparar):
//   Todo timestamp naive de la tabla `evento` es HORA DE PARED DE MÉXICO.
// Se guarda naive (sin cambios respecto a lo que escribe el panel) y, al leer o
// comparar, se convierte a un instante real con `AT TIME ZONE` usando esta
// zona. Así `NOW()` (timestamptz) y el valor del evento son comparables sin
// depender de la zona del servidor, y lo que sale hacia el cliente lleva ya el
// instante correcto.
//
// A futuro, si se migran las columnas a `timestamptz`, basta con quitar los
// `AT TIME ZONE` de estas expresiones y dejar las columnas tal cual.
export const ZONA_EVENTOS = 'America/Mexico_City';

/**
 * Cierre efectivo de inscripciones, como timestamptz.
 * Si el evento no define `fecha_limite_registro`, el cierre es UNA HORA ANTES
 * del inicio: es lo que el panel de administración ya le promete al usuario
 * ("si se deja vacío, se cierra 1 hora antes del inicio") y hasta ahora no
 * existía en ninguna parte del servidor.
 * @param {string} alias alias de la tabla evento en la consulta (p. ej. 'e')
 */
export const sqlLimiteRegistro = (alias = 'e') =>
  `(COALESCE(${alias}.fecha_limite_registro,
             (${alias}.fecha_inicio + ${alias}.hora_inicio) - INTERVAL '1 hour')
    AT TIME ZONE '${ZONA_EVENTOS}')`;

/** ¿Ya cerró el periodo de inscripción? */
export const sqlRegistroCerrado = (alias = 'e') => `(${sqlLimiteRegistro(alias)} <= NOW())`;

/** Fin real del evento (fecha_fin + hora_fin), como timestamptz. */
export const sqlFinEvento = (alias = 'e') =>
  `((${alias}.fecha_fin + ${alias}.hora_fin) AT TIME ZONE '${ZONA_EVENTOS}')`;

/** ¿El evento ya terminó? */
export const sqlEventoTerminado = (alias = 'e') => `(${sqlFinEvento(alias)} < NOW())`;
