// src/lib/eventos-listado.js
//
// Consulta del listado público de eventos, en un solo sitio.
//
// La usan DOS consumidores que antes habrían tenido que duplicarla:
//   - /api/eventos          (la sigue necesitando: SWR revalida desde el
//                            cliente tras inscribirse, y /eventos/[id] la usa)
//   - /eventos (page.jsx)   Server Component que ya trae los eventos en el HTML
//
// Tenerla aquí garantiza que el primer pintado (servidor) y las revalidaciones
// (cliente) devuelvan exactamente la misma forma de dato: si divergen, la lista
// "salta" al hidratar porque React encuentra un árbol distinto al que envió.

import { query } from '@/lib/db-server';
import { ZONA_EVENTOS, sqlRegistroCerrado, sqlEventoTerminado } from '@/lib/eventos-fechas';

// Se usa `query()` en vez del template `sql` porque las expresiones de zona
// horaria son SQL, no parámetros.
//
// `fecha_limite_registro` se convierte a instante real: la columna guarda
// hora de pared de México sin zona y leerla en crudo la interpretaba como
// UTC, adelantando el cierre seis horas. Ver src/lib/eventos-fechas.js.
const SQL_EVENTOS_PUBLICOS = `
  SELECT
    e.id_evento,
    e.nombre as nombre_evento,
    e.descripcion_html as descripcion,
    t.nombre as tipo,
    a.nombre as hermandad,
    e.fecha_inicio as fecha,
    e.hora_inicio,
    e.fecha_fin,
    e.hora_fin,
    (e.fecha_limite_registro AT TIME ZONE '${ZONA_EVENTOS}') AS fecha_limite_registro,
    ${sqlRegistroCerrado('e')} AS registro_cerrado,
    ${sqlEventoTerminado('e')} AS evento_terminado,
    e.tiene_costo,
    e.costo,
    e.instrucciones_pago,
    e.cupos,
    e.ubicacion,
    e.cupos_disponibles,
    e.imagen_flyer_url as imagen_url,
    e.estado,
    e.solicitar_talla,
    -- Datos de concurso: la tarjeta necesita saber si el evento se inscribe por
    -- equipos para mandar ese flujo al detalle (el formulario de equipo vive
    -- allí) en lugar de abrir el registro individual genérico.
    t.permite_equipos,
    c.id_concurso,
    c.modalidad,
    c.min_integrantes_equipo,
    c.max_integrantes_equipo,
    (
      SELECT COALESCE(SUM(
               CASE WHEN ie.id_equipo IS NOT NULL
                    THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = ie.id_equipo)
                    ELSE 1 END
             ), 0)::int
      FROM inscripcion_evento ie
      WHERE ie.id_evento = e.id_evento AND ie.estado <> 'cancelada'
    ) as lugares_ocupados
  FROM evento e
  JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
  JOIN catalogo_alcance_evento a ON e.id_alcance = a.id_alcance
  LEFT JOIN concurso c ON e.id_evento = c.id_evento
  WHERE e.estado IN ('publicado', 'en_curso')
    AND e.deleted_at IS NULL
    AND e.listable = TRUE
  ORDER BY
    e.fecha_inicio ASC,
    e.hora_inicio ASC
`;

/**
 * Devuelve los eventos públicos ya formateados para la UI.
 *
 * El resultado es JSON-serializable a propósito (fechas como cadenas, números
 * como números): viaja tal cual por la respuesta del API y también como props
 * de un Server Component al cliente, y las props de un Server Component sólo
 * admiten valores serializables — un `Date` del driver de pg no lo es.
 */
export async function listarEventosPublicos() {
  const today = new Date().toISOString().split('T')[0];
  const resultado = await query(SQL_EVENTOS_PUBLICOS);

  return resultado.rows.map((evento) => {
    // `fecha` llega como objeto Date (el driver convierte las columnas DATE).
    // Antes se comparaba ese Date contra la cadena 'YYYY-MM-DD': la
    // comparación pasaba por Number(), daba NaN y TODOS los eventos salían
    // como 'future'. Se normaliza a cadena antes de comparar.
    const fechaStr = evento.fecha instanceof Date
      ? evento.fecha.toISOString().split('T')[0]
      : String(evento.fecha);

    let estadoTiempo = 'future';
    if (fechaStr < today) estadoTiempo = 'past';
    else if (fechaStr === today) estadoTiempo = 'today';

    return {
      ...evento,
      // `estado` conserva el valor REAL de la base ('publicado'/'en_curso').
      // Antes se pisaba con el estado visual y la UI llegaba a imprimirle
      // al usuario la palabra "future".
      estado: evento.estado,
      estado_tiempo: estadoTiempo,
      registro_cerrado: Boolean(evento.registro_cerrado),
      evento_terminado: Boolean(evento.evento_terminado),
      fecha: fechaStr,
      fecha_fin: evento.fecha_fin ? new Date(evento.fecha_fin).toISOString().split('T')[0] : fechaStr,
      fecha_limite_registro: evento.fecha_limite_registro instanceof Date
        ? evento.fecha_limite_registro.toISOString()
        : evento.fecha_limite_registro,
      hora_inicio: evento.hora_inicio?.toString?.() ?? null,
      hora_fin: evento.hora_fin?.toString?.() ?? null,
      costo: evento.costo !== null ? Number(evento.costo) : null,
      cupos: evento.cupos !== null ? Number(evento.cupos) : null,
      cupos_disponibles: evento.cupos_disponibles !== null ? Number(evento.cupos_disponibles) : null,
      // Lugares realmente ocupados (los equipos cuentan por integrante).
      lugares_ocupados: Number(evento.lugares_ocupados) || 0,
    };
  });
}

// Códigos con los que `pg` reporta que no se pudo hablar con la base.
// El API los traduce a 503 y la página a un aviso de "vuelve a intentarlo",
// en vez de dejar que un fallo de red se vea como una lista vacía.
export const CODIGOS_CONEXION = ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'];

export function esErrorDeConexion(error) {
  return CODIGOS_CONEXION.includes(error?.code);
}
