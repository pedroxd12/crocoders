// Ganadores de un evento (tabla `ganador_evento`, migración 015): consulta y
// forma compartidas por el panel de administración, el API público, la
// página de resultados y la generación de reconocimientos.
//
// MODELO
// ------
// Un ganador apunta a una INSCRIPCIÓN premiada (equipo en concursos por
// equipos, persona en el resto) y a un desafío o a la clasificación general
// (`id_reto` NULL). Así un hackatón puede premiar "ganador del reto X" y
// además "1er lugar general", y un concurso individual sólo lo segundo.

const NOMBRE_MIEMBRO = (alias) =>
  `TRIM(CONCAT(${alias}.nombre, ' ', ${alias}.apellido_paterno, ' ', COALESCE(${alias}.apellido_materno, '')))`;

// Roster del equipo premiado (para la presentación y los reconocimientos por
// integrante). Sólo integrantes: el asesor acompaña, no compite.
const SQL_INTEGRANTES = `
      COALESCE((
        SELECT json_agg(json_build_object(
                 'id', it.id_integrante,
                 'nombre', CASE WHEN tm.id_miembro IS NOT NULL THEN ${NOMBRE_MIEMBRO('tm')} ELSE ti.nombre_completo END,
                 'correo', COALESCE(tm.correo_electronico, ti.correo_electronico),
                 'institucion', CASE WHEN tm.id_miembro IS NOT NULL THEN NULL ELSE ti.escuela_institucion END,
                 'es_capitan', COALESCE(it.es_capitan, false)
               ) ORDER BY it.es_capitan DESC, it.id_integrante)
          FROM integrante_equipo it
          LEFT JOIN miembro tm ON tm.id_miembro = it.id_miembro
          LEFT JOIN invitado ti ON ti.id_invitado = it.id_invitado
         WHERE it.id_equipo = eq.id_equipo), '[]'::json) AS integrantes`;

const SQL_GANADORES = `
      SELECT
        g.id_ganador, g.id_evento, g.id_reto, g.id_inscripcion, g.posicion,
        g.titulo, g.premio, g.notas, g.created_at, g.updated_at,
        r.titulo AS reto_titulo, r.slug AS reto_slug, r.orden AS reto_orden, r.tono AS reto_tono,
        r.patrocinador AS reto_patrocinador,
        ie.estado AS estado_inscripcion,
        CASE
          WHEN eq.id_equipo IS NOT NULL THEN 'equipo'
          WHEN m.id_miembro IS NOT NULL THEN 'miembro'
          ELSE 'invitado'
        END AS tipo,
        CASE
          WHEN eq.id_equipo IS NOT NULL THEN eq.nombre_equipo
          WHEN m.id_miembro IS NOT NULL THEN ${NOMBRE_MIEMBRO('m')}
          ELSE i.nombre_completo
        END AS nombre,
        CASE WHEN eq.id_equipo IS NULL THEN COALESCE(m.correo_electronico, i.correo_electronico) END AS correo,
        CASE WHEN eq.id_equipo IS NULL AND i.id_invitado IS NOT NULL THEN i.escuela_institucion END AS institucion,
        ${SQL_INTEGRANTES}
      FROM ganador_evento g
      JOIN inscripcion_evento ie ON ie.id_inscripcion = g.id_inscripcion
      LEFT JOIN reto_evento r ON r.id_reto = g.id_reto
      LEFT JOIN equipo_concurso eq ON eq.id_equipo = ie.id_equipo
      LEFT JOIN miembro m ON m.id_miembro = ie.id_miembro
      LEFT JOIN invitado i ON i.id_invitado = ie.id_invitado
      WHERE g.id_evento = $1
      ORDER BY (g.id_reto IS NOT NULL), r.orden NULLS FIRST, r.id_reto, g.posicion`;

/**
 * Ganadores del evento, ya agrupados: `general` (sin desafío) y `retos`
 * (uno por desafío con ganadores, en el orden de la baraja).
 */
export async function listarGanadores(client, idEvento) {
  const { rows } = await client.query(SQL_GANADORES, [Number(idEvento)]);
  const filas = rows.map((f) => ({
    ...f,
    id_ganador: Number(f.id_ganador),
    id_reto: f.id_reto == null ? null : Number(f.id_reto),
    id_inscripcion: Number(f.id_inscripcion),
    posicion: Number(f.posicion),
    integrantes: Array.isArray(f.integrantes) ? f.integrantes : [],
  }));

  const general = filas.filter((f) => f.id_reto == null);
  const porReto = new Map();
  for (const f of filas) {
    if (f.id_reto == null) continue;
    if (!porReto.has(f.id_reto)) {
      porReto.set(f.id_reto, {
        id_reto: f.id_reto,
        titulo: f.reto_titulo,
        slug: f.reto_slug,
        tono: f.reto_tono,
        patrocinador: f.reto_patrocinador,
        ganadores: [],
      });
    }
    porReto.get(f.id_reto).ganadores.push(f);
  }
  return { general, retos: [...porReto.values()], total: filas.length };
}

/** "1er lugar", "2do lugar", "3er lugar", "4to lugar"… */
export function etiquetaPosicion(posicion, titulo = null) {
  if (titulo) return titulo;
  const n = Number(posicion);
  const sufijo = n === 1 ? 'er' : n === 2 ? 'do' : n === 3 ? 'er' : n >= 4 && n <= 6 ? 'to' : n === 7 ? 'mo' : n === 8 ? 'vo' : n === 9 ? 'no' : 'mo';
  return `${n}${sufijo} lugar`;
}
