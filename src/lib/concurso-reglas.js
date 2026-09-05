// Reglas fijas de los concursos por equipos, en un solo sitio.
//
// Antes cada una vivía escrita a mano donde se necesitaba: el formulario del
// panel arrancaba en 2, el API rechazaba `< 2`, la validación zod topaba en 10
// y `resolverEquipo` inventaba un 5 por defecto. Coinciden con los CHECK de la
// base (`modalidad_equipos_valida`: max_integrantes_equipo >= 2;
// `concurso_max_asesores_check`: 1..5).

export const MODALIDADES = Object.freeze(['individual', 'equipos']);

/** Un equipo necesita al menos dos personas (CHECK de la tabla `concurso`). */
export const MIN_INTEGRANTES_EQUIPO = 2;

/** Tope duro de integrantes por equipo (el que valida zod y el registro). */
export const MAX_INTEGRANTES_EQUIPO = 10;

/** Asesores por equipo: 1..5 (CHECK de la tabla `concurso`). */
export const MIN_ASESORES_EQUIPO = 1;
export const MAX_ASESORES_EQUIPO = 5;

/** Máximo por defecto cuando el concurso no fija uno (nunca debería pasar). */
export const MAX_INTEGRANTES_POR_DEFECTO = 3;

/** Acota `max_asesores` al rango del CHECK. */
export function acotarMaxAsesores(valor) {
  const n = parseInt(valor, 10);
  if (!Number.isFinite(n)) return MIN_ASESORES_EQUIPO;
  return Math.min(MAX_ASESORES_EQUIPO, Math.max(MIN_ASESORES_EQUIPO, n));
}

/** Estados de evento que el panel puede fijar (cancelado sólo vía baja). */
export const ESTADOS_EVENTO_EDITABLES = Object.freeze(['planificacion', 'publicado', 'en_curso', 'finalizado']);

export const ETIQUETA_ESTADO_EVENTO = Object.freeze({
  planificacion: 'Borrador (no público)',
  publicado: 'Publicado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
});
