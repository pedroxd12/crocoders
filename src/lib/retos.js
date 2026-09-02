// Retos (desafíos) de un evento: consulta y contabilidad de cupo, en un solo
// sitio.
//
// UNIDAD DEL CUPO DE UN RETO
// --------------------------
// `reto_evento.cupo_equipos` cuenta INSCRIPCIONES, no personas: una fila de
// `inscripcion_evento` es un equipo en un evento por equipos y una persona en
// uno individual. Es una unidad DISTINTA del aforo del evento
// (`evento.cupos`, medido en lugares/personas, ver src/lib/eventos-cupos.js) y
// las dos se comprueban por separado al inscribirse: un equipo de 5 consume 5
// lugares del evento y 1 plaza de su reto.
//
// A diferencia de `evento.cupos_disponibles`, aquí NO hay contador
// denormalizado ni trigger: la ocupación se deriva siempre de las
// inscripciones reales. Ese fue el problema que costó reparar en los eventos y
// no se repite.

// Una inscripción ocupa su plaza mientras no esté cancelada ('pendiente'
// también aparta, igual que en el aforo del evento).
const ESTADOS_QUE_OCUPAN = "estado <> 'cancelada'";

// Columnas públicas de un reto. `imagen_key` NO entra: es interna (sirve para
// borrar el archivo del CDN) y no debe viajar a la web.
const COLUMNAS_PUBLICAS = `
  r.id_reto, r.id_evento, r.slug, r.titulo, r.lede, r.resumen, r.descripcion,
  r.entregable, r.patrocinador, r.premio, r.tags, r.criterios,
  r.cupo_equipos, r.imagen_url, r.tono, r.orden, r.activo
`;

// Inscripciones vivas de cada reto. Subconsulta y no JOIN + GROUP BY para que
// un reto sin inscripciones siga saliendo (y con 0, no con NULL).
const SQL_OCUPADOS = `(
  SELECT COUNT(*) FROM inscripcion_evento ie
   WHERE ie.id_reto = r.id_reto AND ie.${ESTADOS_QUE_OCUPAN}
)::int`;

/**
 * Normaliza una fila de `reto_evento` a la forma que consume la UI.
 * `equipos_ocupados` / `equipos_disponibles` van en plazas de reto (ver
 * cabecera): con `cupo_equipos` NULL el reto no tiene tope propio.
 */
export function formatearReto(fila) {
  const cupo = fila.cupo_equipos == null ? null : Number(fila.cupo_equipos);
  const ocupados = Number(fila.equipos_ocupados) || 0;
  return {
    ...fila,
    id_reto: Number(fila.id_reto),
    id_evento: Number(fila.id_evento),
    tags: Array.isArray(fila.tags) ? fila.tags : [],
    criterios: Array.isArray(fila.criterios) ? fila.criterios : [],
    cupo_equipos: cupo,
    tono: Number(fila.tono) || 1,
    orden: Number(fila.orden) || 0,
    activo: Boolean(fila.activo),
    equipos_ocupados: ocupados,
    equipos_disponibles: cupo === null ? null : Math.max(0, cupo - ocupados),
    lleno: cupo !== null && ocupados >= cupo,
  };
}

/**
 * Retos de un evento con su ocupación real.
 * @param {{query: Function}} client  cliente de pg (o el `query` de db-server)
 * @param {number|string} idEvento
 * @param {{soloActivos?: boolean}} opciones
 */
export async function listarRetos(client, idEvento, { soloActivos = false } = {}) {
  const res = await client.query(
    `SELECT ${COLUMNAS_PUBLICAS}, ${SQL_OCUPADOS} AS equipos_ocupados
       FROM reto_evento r
      WHERE r.id_evento = $1 ${soloActivos ? 'AND r.activo = TRUE' : ''}
      ORDER BY r.orden ASC, r.id_reto ASC`,
    [idEvento],
  );
  return res.rows.map(formatearReto);
}

/**
 * ¿Tiene este evento retos activos? Si los tiene, elegir uno es OBLIGATORIO al
 * inscribirse: es la regla "un equipo, un desafío" y evita inscripciones
 * huérfanas que después nadie sabe a qué reto asignar.
 */
export async function eventoExigeReto(client, idEvento) {
  const res = await client.query(
    'SELECT 1 FROM reto_evento WHERE id_evento = $1 AND activo = TRUE LIMIT 1',
    [idEvento],
  );
  return res.rows.length > 0;
}

/**
 * Valida el reto elegido por una inscripción y comprueba su cupo.
 *
 * Debe llamarse DENTRO de la transacción del registro y con la fila del evento
 * ya bloqueada (`SELECT ... FOR UPDATE`): ese bloqueo es lo que serializa dos
 * registros simultáneos al mismo reto y evita que ambos vean la última plaza
 * libre. Aquí se bloquea además la fila del reto por si el aforo del evento
 * fuera ilimitado y el del reto el único tope real.
 *
 * @param {*} client cliente de pg dentro de la transacción
 * @param {number} idEvento
 * @param {number|null|undefined} idReto  el que mandó el cliente
 * @param {{forzar?: boolean}} opciones  `forzar` (admin) salta el tope de cupo
 * @returns {Promise<{ok: true, idReto: number|null, reto: object|null} | {ok: false, error: string}>}
 */
export async function resolverRetoDeInscripcion(client, idEvento, idReto, { forzar = false } = {}) {
  const exige = await eventoExigeReto(client, idEvento);

  if (idReto == null || idReto === '') {
    if (exige) {
      return { ok: false, error: 'Este evento se inscribe por desafío: elige uno para continuar.' };
    }
    return { ok: true, idReto: null, reto: null };
  }

  const id = Number(idReto);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: 'El desafío seleccionado no es válido.' };
  }

  // Dos consultas y no una con subconsulta: el bloqueo va sobre la fila del
  // reto y se pide en un SELECT sin agregados, que es donde PostgreSQL admite
  // FOR UPDATE sin discusión. El recuento viene después, ya con la fila
  // bloqueada, así que sigue siendo atómico frente a otro registro simultáneo.
  const res = await client.query(
    `SELECT r.id_reto, r.id_evento, r.titulo, r.activo, r.cupo_equipos
       FROM reto_evento r
      WHERE r.id_reto = $1 AND r.id_evento = $2
      FOR UPDATE`,
    [id, idEvento],
  );
  if (res.rows.length === 0) {
    return { ok: false, error: 'El desafío seleccionado no pertenece a este evento.' };
  }

  const ocupadosRes = await client.query(
    `SELECT COUNT(*)::int AS equipos_ocupados
       FROM inscripcion_evento ie
      WHERE ie.id_reto = $1 AND ie.${ESTADOS_QUE_OCUPAN}`,
    [id],
  );

  const reto = formatearReto({ ...res.rows[0], ...ocupadosRes.rows[0] });
  if (!reto.activo) {
    return { ok: false, error: `El desafío “${reto.titulo}” ya no admite registros.` };
  }
  if (!forzar && reto.lleno) {
    return {
      ok: false,
      error: `El desafío “${reto.titulo}” ya alcanzó su cupo de ${reto.cupo_equipos} equipo(s). Elige otro.`,
    };
  }

  return { ok: true, idReto: reto.id_reto, reto };
}

/**
 * Convierte un título en slug (el identificador que viaja en ?reto= y en el
 * ancla de la landing). Se genera en el servidor para que dos administradores
 * escribiendo el mismo título produzcan el mismo identificador.
 *
 * `max` existe porque las dos columnas que lo guardan tienen tamaños distintos:
 * `reto_evento.slug` es varchar(80) y `evento.slug` varchar(60). Pasarse
 * devuelve un 22001 y el admin sólo vería un 500 sin explicación.
 */
export function slugificar(texto, max = 80) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    // Recortar puede dejar el guion suelto al final ("clasificacion-arancel-").
    .replace(/-+$/, '');
}

/**
 * Slug libre dentro del evento. Si el propuesto ya existe le añade -2, -3…
 * (`idRetoActual` se excluye para poder renombrar un reto sin chocar consigo
 * mismo).
 */
export async function slugDisponible(client, idEvento, propuesto, idRetoActual = null) {
  const base = slugificar(propuesto) || 'reto';
  const res = await client.query(
    'SELECT slug FROM reto_evento WHERE id_evento = $1 AND ($2::int IS NULL OR id_reto <> $2)',
    [idEvento, idRetoActual],
  );
  const usados = new Set(res.rows.map((r) => r.slug));
  if (!usados.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidato = `${base.slice(0, 76)}-${i}`;
    if (!usados.has(candidato)) return candidato;
  }
  return `${base.slice(0, 70)}-${Date.now().toString(36)}`;
}
