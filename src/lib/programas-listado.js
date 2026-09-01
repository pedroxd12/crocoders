// src/lib/programas-listado.js
//
// Consulta del catálogo público de programas recurrentes (talleres/cursos), en
// un solo sitio. La comparten /api/programas y el Server Component de
// /programas, para que el HTML inicial y las revalidaciones de SWR devuelvan
// exactamente la misma forma de dato.

import { sql } from '@/lib/db-server';

/**
 * Devuelve los programas activos ya formateados y ordenados para la UI.
 * El resultado es JSON-serializable: viaja igual por el API que como props de
 * un Server Component (donde un `Date` del driver de pg no sería válido).
 */
export async function listarProgramasPublicos() {
  const today = new Date().toISOString().split('T')[0];

  const programas = await sql`
    SELECT
      p.id_programa,
      p.nombre,
      p.descripcion,
      p.fecha_inicio,
      p.fecha_fin,
      p.ubicacion,
      p.imagen_url,
      p.dias_semana,
      p.hora_inicio,
      p.hora_fin,
      p.sesiones_requeridas_certificado,
      p.porcentaje_asistencia_minimo,
      t.nombre AS tipo,
      a.nombre AS alcance,
      (SELECT COUNT(*) FROM sesion_programa sp WHERE sp.id_programa = p.id_programa) AS total_sesiones,
      (SELECT COUNT(*) FROM inscripcion_programa ip WHERE ip.id_programa = p.id_programa AND ip.estado <> 'cancelada') AS total_inscritos
    FROM programa_recurrente p
    LEFT JOIN catalogo_tipo_evento t ON p.id_tipo_evento = t.id_tipo_evento
    LEFT JOIN catalogo_alcance_evento a ON p.id_alcance = a.id_alcance
    WHERE p.activo = true
    ORDER BY p.fecha_inicio DESC
  `;

  const formateados = programas.map((p) => {
    // Estado temporal para la UI según el rango de fechas del programa.
    let estado = 'future';
    const ini = p.fecha_inicio ? new Date(p.fecha_inicio).toISOString().split('T')[0] : null;
    const fin = p.fecha_fin ? new Date(p.fecha_fin).toISOString().split('T')[0] : ini;
    if (fin && fin < today) estado = 'past';
    else if (ini && ini <= today && fin >= today) estado = 'en_curso';

    return {
      ...p,
      fecha_inicio: ini,
      fecha_fin: fin,
      hora_inicio: p.hora_inicio?.toString?.() ?? null,
      hora_fin: p.hora_fin?.toString?.() ?? null,
      total_sesiones: Number(p.total_sesiones) || 0,
      total_inscritos: Number(p.total_inscritos) || 0,
      estado,
    };
  });

  // Los programas terminados van al final: `activo` es un interruptor manual del
  // panel (nada lo apaga al pasar fecha_fin), así que sin este orden un curso
  // cerrado hace un año encabezaba el catálogo por delante de los que ya empezaron.
  const ORDEN = { en_curso: 0, future: 1, past: 2 };
  formateados.sort((a, b) => {
    const d = ORDEN[a.estado] - ORDEN[b.estado];
    if (d !== 0) return d;
    // Dentro de cada grupo: los próximos por fecha más cercana, los pasados por
    // fecha más reciente.
    return a.estado === 'future'
      ? String(a.fecha_inicio).localeCompare(String(b.fecha_inicio))
      : String(b.fecha_inicio).localeCompare(String(a.fecha_inicio));
  });

  return formateados;
}
