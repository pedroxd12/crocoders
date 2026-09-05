// Unidad y textos del AFORO de un evento, en un solo sitio (puro: se importa
// desde componentes de cliente y desde el servidor).
//
// LA UNIDAD DEPENDE DE LA MODALIDAD
// ---------------------------------
// En un concurso por equipos una inscripción es UN equipo y `evento.cupos`
// cuenta EQUIPOS: un equipo de 3 ocupa 1 cupo, no 3. En el resto de eventos
// cada inscripción es una persona y `cupos` cuenta PERSONAS. Antes el aforo se
// medía siempre en personas, así que un hackatón con cupo para 40 equipos se
// cerraba al llegar 40 personas (13 equipos).
//
// `esPorEquipos` son las TRES condiciones que siempre se han usado juntas
// (tipo que permite equipos + concurso configurado + modalidad 'equipos');
// vivían copiadas en seis archivos.

export function esPorEquipos(evento) {
  return Boolean(evento?.permite_equipos && evento?.id_concurso && evento?.modalidad === 'equipos');
}

/** 'equipos' | 'personas' */
export function unidadAforo(evento) {
  return esPorEquipos(evento) ? 'equipos' : 'personas';
}

export const UNIDAD_AFORO = Object.freeze({
  equipos: Object.freeze({ singular: 'equipo', plural: 'equipos', inscritos: 'equipos inscritos' }),
  personas: Object.freeze({ singular: 'lugar', plural: 'lugares', inscritos: 'inscritos' }),
});

/** "3 equipos" / "1 lugar" */
export function contarUnidad(n, unidad) {
  const u = UNIDAD_AFORO[unidad] || UNIDAD_AFORO.personas;
  const cantidad = Number(n) || 0;
  return `${cantidad} ${cantidad === 1 ? u.singular : u.plural}`;
}

/**
 * Ocupación y libres a partir de lo que devuelven los endpoints. Prefiere
 * `lugares_ocupados` (derivado de las inscripciones reales) y cae al contador
 * `cupos_disponibles` sólo si el primero no viene.
 */
export function ocupacionDeEvento(evento) {
  const cupos = evento?.cupos == null ? null : Number(evento.cupos);
  let ocupados = Number(evento?.lugares_ocupados);
  if (!Number.isFinite(ocupados)) {
    ocupados = cupos != null && evento?.cupos_disponibles != null
      ? Math.max(0, cupos - Number(evento.cupos_disponibles))
      : 0;
  }
  const libres = cupos == null ? null : Math.max(0, cupos - ocupados);
  const lleno = cupos != null && ocupados >= cupos;
  const porcentaje = cupos ? Math.max(0, Math.min(100, Math.round((ocupados / cupos) * 100))) : 0;
  return { cupos, ocupados, libres, lleno, porcentaje, unidad: unidadAforo(evento) };
}

/** "Quedan 3 equipos" / "Queda 1 lugar" / "No quedan lugares" */
export function textoRestantes(libres, unidad) {
  const u = UNIDAD_AFORO[unidad] || UNIDAD_AFORO.personas;
  if (libres == null) return `Sin límite de ${u.plural}`;
  if (libres <= 0) return `No quedan ${u.plural}`;
  return `${libres === 1 ? 'Queda' : 'Quedan'} ${contarUnidad(libres, unidad)}`;
}
