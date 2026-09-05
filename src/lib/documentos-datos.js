// Personas a las que se les genera un documento (certificado, gafete o
// reconocimiento) según el ámbito (evento o programa) y la audiencia.
//
// Devuelve una lista homogénea con los datos que el generador sabe pintar
// (src/lib/documentos-campos.js): nombre, rol, equipo, institución, correo,
// desafío, lugar, premio, mesa y, en eventos, la inscripción para el QR del
// ticket. Una persona = una página.

import { firmarQrToken } from '@/lib/qr-token';
import { listarGanadores, etiquetaPosicion } from '@/lib/ganadores';
import { formatearFechaLarga, formatearFechaMedia } from '@/lib/fechas';

const NOMBRE_MIEMBRO = (alias) =>
  `TRIM(CONCAT(${alias}.nombre, ' ', ${alias}.apellido_paterno, ' ', COALESCE(${alias}.apellido_materno, '')))`;

const aDia = (v) => (v instanceof Date ? v.toISOString().split('T')[0] : v ?? null);

/** Texto de fecha del evento/programa para el campo `fecha`. */
export function textoFecha(inicio, fin) {
  const i = aDia(inicio);
  const f = aDia(fin);
  if (!i) return '';
  if (!f || f === i) return formatearFechaLarga(i);
  return `${formatearFechaMedia(i)} al ${formatearFechaMedia(f)}`;
}

/** Cabecera del evento o programa (nombre y fecha) para todos los documentos. */
export async function cargarContexto(client, ambito, id) {
  if (ambito === 'evento') {
    const { rows } = await client.query(
      `SELECT e.id_evento AS id, e.nombre, e.fecha_inicio, e.fecha_fin, e.asignar_mesas,
              t.nombre AS tipo, c.modalidad, t.permite_equipos, c.id_concurso
         FROM evento e
         LEFT JOIN catalogo_tipo_evento t ON t.id_tipo_evento = e.id_tipo_evento
         LEFT JOIN concurso c ON c.id_evento = e.id_evento
        WHERE e.id_evento = $1 AND e.deleted_at IS NULL`,
      [id],
    );
    const e = rows[0];
    if (!e) return null;
    return { ambito, id: Number(e.id), nombre: e.nombre, fecha: textoFecha(e.fecha_inicio, e.fecha_fin), porEquipos: Boolean(e.permite_equipos && e.id_concurso && e.modalidad === 'equipos') };
  }
  const { rows } = await client.query(
    `SELECT id_programa AS id, nombre, fecha_inicio, fecha_fin FROM programa_recurrente WHERE id_programa = $1`,
    [id],
  );
  const p = rows[0];
  if (!p) return null;
  return { ambito, id: Number(p.id), nombre: p.nombre, fecha: textoFecha(p.fecha_inicio, p.fecha_fin), porEquipos: false };
}

/**
 * Lista de personas para una audiencia. Cada entrada trae `clave` (única y
 * estable, sirve para elegir en el panel), los datos del documento y
 * `inscripcion` (evento) o `inscripcion_programa` para el QR.
 *
 * @param {object} client            cliente de pg
 * @param {object} contexto          resultado de cargarContexto
 * @param {string} audiencia         participantes | staff | jueces | ganadores
 * @param {object} opciones          { soloAsistieron, soloAcreditados, incluirAsesores, incluirEquipo }
 */
export async function listarPersonasDocumento(client, contexto, audiencia, opciones = {}) {
  const base = { evento: contexto.nombre, fecha: contexto.fecha };
  const { id } = contexto;

  if (contexto.ambito === 'programa') {
    if (audiencia !== 'participantes') return [];
    const { rows } = await client.query(
      `SELECT ip.id_inscripcion_programa, ip.id_programa, ip.mesa, ip.elegible_certificado, ip.certificado_emitido,
              CASE WHEN m.id_miembro IS NOT NULL THEN ${NOMBRE_MIEMBRO('m')} ELSE i.nombre_completo END AS nombre,
              COALESCE(m.correo_electronico, i.correo_electronico) AS correo,
              CASE WHEN m.id_miembro IS NOT NULL THEN NULL ELSE i.escuela_institucion END AS institucion,
              (SELECT COUNT(*)::int FROM (
                 SELECT am.id_sesion FROM asistencia_miembro am JOIN sesion_programa sp ON sp.id_sesion = am.id_sesion
                  WHERE sp.id_programa = ip.id_programa AND am.id_miembro = ip.id_miembro AND am.asistio
                 UNION ALL
                 SELECT ai.id_sesion FROM asistencia_invitado ai JOIN sesion_programa sp ON sp.id_sesion = ai.id_sesion
                  WHERE sp.id_programa = ip.id_programa AND ai.id_invitado = ip.id_invitado AND ai.asistio
               ) x) AS sesiones_asistidas
         FROM inscripcion_programa ip
         LEFT JOIN miembro m ON m.id_miembro = ip.id_miembro
         LEFT JOIN invitado i ON i.id_invitado = ip.id_invitado
        WHERE ip.id_programa = $1 AND ip.estado <> 'cancelada'
        ORDER BY nombre`,
      [id],
    );
    return rows
      .filter((r) => !opciones.soloAcreditados || r.certificado_emitido)
      .filter((r) => !opciones.soloAsistieron || Number(r.sesiones_asistidas) > 0)
      .map((r) => ({
        ...base,
        clave: `pp-${r.id_inscripcion_programa}`,
        tipo_entidad: 'persona',
        nombre: r.nombre,
        correo: r.correo,
        institucion: r.institucion,
        rol: 'Participante',
        equipo: '',
        desafio: '',
        lugar: '',
        premio: '',
        mesa: r.mesa || '',
        detalle: r.certificado_emitido ? 'Acreditado' : r.elegible_certificado ? 'Elegible' : `${r.sesiones_asistidas} sesiones`,
        inscripcion_programa: { id: Number(r.id_inscripcion_programa), pid: Number(r.id_programa) },
      }));
  }

  // ---------------------------------------------------------------- evento
  if (audiencia === 'participantes') {
    const { rows } = await client.query(
      `SELECT ie.id_inscripcion, ie.id_evento, ie.id_equipo, ie.asistio, ie.mesa,
              r.titulo AS desafio, eq.nombre_equipo,
              CASE WHEN m.id_miembro IS NOT NULL THEN ${NOMBRE_MIEMBRO('m')} ELSE i.nombre_completo END AS nombre,
              COALESCE(m.correo_electronico, i.correo_electronico) AS correo,
              CASE WHEN m.id_miembro IS NOT NULL THEN NULL ELSE i.escuela_institucion END AS institucion
         FROM inscripcion_evento ie
         LEFT JOIN reto_evento r ON r.id_reto = ie.id_reto
         LEFT JOIN equipo_concurso eq ON eq.id_equipo = ie.id_equipo
         LEFT JOIN miembro m ON m.id_miembro = ie.id_miembro
         LEFT JOIN invitado i ON i.id_invitado = ie.id_invitado
        WHERE ie.id_evento = $1 AND ie.estado <> 'cancelada'
        ORDER BY ie.fecha_inscripcion, ie.id_inscripcion`,
      [id],
    );
    const salida = [];
    for (const ie of rows) {
      const comun = {
        ...base,
        equipo: ie.nombre_equipo || '',
        desafio: ie.desafio || '',
        lugar: '',
        premio: '',
        mesa: ie.mesa || '',
        inscripcion: { id: Number(ie.id_inscripcion), eid: Number(ie.id_evento) },
      };
      if (!ie.id_equipo) {
        if (opciones.soloAsistieron && !ie.asistio) continue;
        salida.push({
          ...comun,
          clave: `p-${ie.id_inscripcion}`,
          tipo_entidad: 'persona',
          nombre: ie.nombre,
          correo: ie.correo,
          institucion: ie.institucion,
          rol: 'Participante',
          detalle: ie.asistio ? 'Asistió' : 'Sin llegada registrada',
        });
        continue;
      }
      const integrantes = await client.query(
        `SELECT it.id_integrante, it.es_capitan, it.asistio,
                CASE WHEN m.id_miembro IS NOT NULL THEN ${NOMBRE_MIEMBRO('m')} ELSE i.nombre_completo END AS nombre,
                COALESCE(m.correo_electronico, i.correo_electronico) AS correo,
                CASE WHEN m.id_miembro IS NOT NULL THEN NULL ELSE i.escuela_institucion END AS institucion
           FROM integrante_equipo it
           LEFT JOIN miembro m ON m.id_miembro = it.id_miembro
           LEFT JOIN invitado i ON i.id_invitado = it.id_invitado
          WHERE it.id_equipo = $1
          ORDER BY it.es_capitan DESC, it.id_integrante`,
        [ie.id_equipo],
      );
      for (const p of integrantes.rows) {
        if (opciones.soloAsistieron && !p.asistio) continue;
        salida.push({
          ...comun,
          clave: `i-${p.id_integrante}`,
          tipo_entidad: 'persona',
          nombre: p.nombre,
          correo: p.correo,
          institucion: p.institucion,
          rol: p.es_capitan ? 'Capitán' : 'Integrante',
          detalle: `${ie.nombre_equipo}${p.asistio ? ' · asistió' : ''}`,
        });
      }
      if (opciones.incluirAsesores !== false) {
        const asesores = await client.query(
          'SELECT id_asesor, nombre, correo, asistio FROM asesor_equipo WHERE id_equipo = $1 ORDER BY id_asesor',
          [ie.id_equipo],
        );
        for (const a of asesores.rows) {
          if (opciones.soloAsistieron && !a.asistio) continue;
          salida.push({
            ...comun,
            clave: `a-${a.id_asesor}`,
            tipo_entidad: 'persona',
            nombre: a.nombre,
            correo: a.correo,
            institucion: null,
            rol: 'Asesor',
            detalle: `${ie.nombre_equipo} · asesor`,
          });
        }
      }
    }
    return salida;
  }

  if (audiencia === 'staff') {
    const { rows } = await client.query(
      `SELECT s.id_staff, ${NOMBRE_MIEMBRO('m')} AS nombre, m.correo_electronico AS correo, r.nombre AS rol
         FROM staff_evento s
         JOIN miembro m ON m.id_miembro = s.id_miembro
         LEFT JOIN catalogo_rol_staff r ON r.id_rol = s.id_rol
        WHERE s.id_evento = $1
        ORDER BY r.nombre, nombre`,
      [id],
    );
    return rows.map((r) => ({
      ...base,
      clave: `s-${r.id_staff}`,
      tipo_entidad: 'persona',
      nombre: r.nombre,
      correo: r.correo,
      institucion: null,
      rol: r.rol || 'Staff',
      equipo: '',
      desafio: '',
      lugar: '',
      premio: '',
      mesa: '',
      detalle: r.rol || 'Staff',
    }));
  }

  if (audiencia === 'jueces') {
    const { rows } = await client.query(
      `SELECT id_juez, nombre_completo, correo_electronico, institucion, es_principal
         FROM juez_evento WHERE id_evento = $1
        ORDER BY es_principal DESC, nombre_completo`,
      [id],
    );
    return rows.map((r) => ({
      ...base,
      clave: `j-${r.id_juez}`,
      tipo_entidad: 'persona',
      nombre: r.nombre_completo,
      correo: r.correo_electronico,
      institucion: r.institucion,
      rol: r.es_principal ? 'Juez principal' : 'Juez',
      equipo: '',
      desafio: '',
      lugar: '',
      premio: '',
      mesa: '',
      detalle: r.es_principal ? 'Juez principal' : 'Juez',
    }));
  }

  if (audiencia === 'ganadores') {
    const { general, retos } = await listarGanadores(client, id);
    const todos = [...retos.flatMap((r) => r.ganadores), ...general];
    const salida = [];
    for (const g of todos) {
      const lugar = etiquetaPosicion(g.posicion, g.titulo);
      const comun = {
        ...base,
        desafio: g.reto_titulo || '',
        lugar,
        premio: g.premio || '',
        mesa: '',
        inscripcion: { id: Number(g.id_inscripcion), eid: Number(id) },
      };
      if (g.tipo === 'equipo') {
        if (opciones.incluirEquipo !== false) {
          salida.push({
            ...comun,
            clave: `g-${g.id_ganador}-equipo`,
            tipo_entidad: 'equipo',
            nombre: g.nombre,
            correo: '',
            institucion: null,
            rol: 'Equipo ganador',
            equipo: g.nombre,
            detalle: `${lugar}${g.reto_titulo ? ` · ${g.reto_titulo}` : ''} · reconocimiento del equipo`,
          });
        }
        for (const p of g.integrantes) {
          salida.push({
            ...comun,
            clave: `g-${g.id_ganador}-i-${p.id}`,
            tipo_entidad: 'persona',
            nombre: p.nombre,
            correo: p.correo,
            institucion: p.institucion,
            rol: p.es_capitan ? 'Capitán' : 'Integrante',
            equipo: g.nombre,
            detalle: `${lugar}${g.reto_titulo ? ` · ${g.reto_titulo}` : ''} · ${g.nombre}`,
          });
        }
      } else {
        salida.push({
          ...comun,
          clave: `g-${g.id_ganador}`,
          tipo_entidad: 'persona',
          nombre: g.nombre,
          correo: g.correo,
          institucion: g.institucion,
          rol: 'Ganador',
          equipo: '',
          detalle: `${lugar}${g.reto_titulo ? ` · ${g.reto_titulo}` : ''}`,
        });
      }
    }
    return salida;
  }

  return [];
}

/**
 * Añade `folio` y `qrToken` a cada persona justo antes de generar. El folio
 * combina el id de la plantilla con un consecutivo; el QR es el ticket real de
 * la inscripción (sólo si algún campo lo usa, para no firmar tokens en vano).
 */
export function completarParaGenerar(personas, { idPlantilla, prefijoFolio, conQr, secret }) {
  return personas.map((p, i) => {
    const folio = `${prefijoFolio}-${String(idPlantilla).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`;
    let qrToken = null;
    if (conQr && secret) {
      if (p.inscripcion) qrToken = firmarQrToken({ id: p.inscripcion.id, eid: p.inscripcion.eid, ts: Date.now() }, secret);
      else if (p.inscripcion_programa) qrToken = firmarQrToken({ id: p.inscripcion_programa.id, pid: p.inscripcion_programa.pid, ts: Date.now() }, secret);
    }
    return { ...p, folio, qrToken };
  });
}

/** Prefijo del folio a partir del nombre del evento: "HackaItlac 2026" → "HACK". */
export function prefijoFolioDe(nombre) {
  const limpio = String(nombre || 'DOC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return (limpio.slice(0, 4) || 'DOC');
}
