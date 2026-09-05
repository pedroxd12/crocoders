// Validación y normalización del cuerpo de alta/edición de un evento, en UN
// solo sitio para POST /api/admin/eventos y PUT /api/admin/eventos/[id].
//
// Antes cada ruta repetía (y a veces contradecía) las reglas: el PUT no
// comprobaba los cupos, ninguno validaba la fecha límite ni que la modalidad
// por equipos fuera compatible con el tipo de evento, y un costo > 0 con la
// casilla desmarcada volvía a activar el cobro en silencio
// (`tiene_costo || costo > 0`). Aquí se decide todo una vez y las rutas sólo
// escriben lo que sale.

import { slugificar } from '@/lib/retos';
import {
  MODALIDADES,
  MIN_INTEGRANTES_EQUIPO,
  MAX_INTEGRANTES_EQUIPO,
  MAX_INTEGRANTES_POR_DEFECTO,
  acotarMaxAsesores,
  ESTADOS_EVENTO_EDITABLES,
} from '@/lib/concurso-reglas';

/** Error de datos del evento: el mensaje va tal cual al administrador. */
export class EventoInvalido extends Error {}

const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const esHora = (v) => /^\d{2}:\d{2}(:\d{2})?$/.test(String(v || ''));
const hhmm = (v) => String(v || '').slice(0, 5);

/**
 * Aforo: '' / null → ilimitado (NULL); entero ≥ 1 en otro caso.
 * `undefined` significa "no viene en el cuerpo" y lo resuelve quien llama.
 */
export function normalizarCupos(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) {
    throw new EventoInvalido('El aforo debe ser un número entero mayor que 0, o quedar vacío para no poner límite.');
  }
  return n;
}

/**
 * @param {object} body  cuerpo JSON del formulario
 * @param {{ tipo: {permite_equipos?: boolean, nombre?: string} | null, esEdicion?: boolean }} ctx
 *   `tipo` es la fila del catálogo del `id_tipo_evento` elegido (para saber si
 *   admite equipos). Con null no se puede validar la modalidad por equipos.
 * @returns {{ evento: object, concurso: object|null }} valores listos para SQL
 */
export function normalizarEvento(body, { tipo = null, esEdicion = false } = {}) {
  const {
    nombre, descripcion_html, id_tipo_evento, id_alcance,
    fecha_inicio, fecha_fin, fecha_limite_registro, hora_inicio, hora_fin,
    ubicacion, cupos, tiene_costo, costo, instrucciones_pago,
    solicitar_talla, asignar_mesas, slug, estado,
    es_concurso, modalidad, max_integrantes_equipo, min_integrantes_equipo,
    id_plataforma, requiere_asesor, asesor_participa, max_asesores, url_concurso,
  } = body || {};

  // --- Identidad -----------------------------------------------------------
  const nombreLimpio = String(nombre || '').trim();
  if (!nombreLimpio) throw new EventoInvalido('El nombre del evento es obligatorio.');
  if (nombreLimpio.length > 255) throw new EventoInvalido('El nombre no puede superar 255 caracteres.');

  const idTipo = parseInt(id_tipo_evento, 10);
  const idAlcance = parseInt(id_alcance, 10);
  if (!Number.isInteger(idTipo) || idTipo <= 0) throw new EventoInvalido('Elige el tipo de evento.');
  if (!Number.isInteger(idAlcance) || idAlcance <= 0) throw new EventoInvalido('Elige el alcance del evento.');

  // --- Fechas y horario ------------------------------------------------------
  if (!esFecha(fecha_inicio)) throw new EventoInvalido('La fecha de inicio es obligatoria.');
  const fechaFin = fecha_fin ? String(fecha_fin) : String(fecha_inicio);
  if (!esFecha(fechaFin)) throw new EventoInvalido('La fecha de fin no es válida.');
  if (fechaFin < fecha_inicio) throw new EventoInvalido('La fecha de fin no puede ser anterior a la de inicio.');
  if (!esHora(hora_inicio) || !esHora(hora_fin)) {
    throw new EventoInvalido('La hora de inicio y la de fin son obligatorias.');
  }
  if (fechaFin === fecha_inicio && hhmm(hora_fin) <= hhmm(hora_inicio)) {
    throw new EventoInvalido('En un evento de un solo día, la hora de fin debe ser posterior a la de inicio.');
  }

  // Cierre de inscripciones: hora de pared de México, igual que el inicio, así
  // que basta comparar las cadenas 'YYYY-MM-DDTHH:MM'.
  let limite = null;
  if (fecha_limite_registro) {
    limite = String(fecha_limite_registro).slice(0, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(limite)) {
      throw new EventoInvalido('La fecha límite de registro no es válida.');
    }
    if (limite > `${fecha_inicio}T${hhmm(hora_inicio)}`) {
      throw new EventoInvalido('El registro debe cerrar antes de que empiece el evento.');
    }
  }

  // --- Aforo -------------------------------------------------------------------
  let cuposValor = normalizarCupos(cupos);
  if (cuposValor === undefined && !esEdicion) cuposValor = null;

  // --- Costo -------------------------------------------------------------------
  const tieneCosto = Boolean(tiene_costo);
  const costoNum = Number(costo);
  if (tieneCosto && (!Number.isFinite(costoNum) || costoNum <= 0)) {
    throw new EventoInvalido('Si el evento tiene costo, indica un importe mayor que cero.');
  }
  const costoValor = tieneCosto ? Math.round(costoNum * 100) / 100 : 0;

  // --- Estado ------------------------------------------------------------------
  let estadoValor;
  if (estado === undefined || estado === null || estado === '') {
    estadoValor = esEdicion ? undefined : 'publicado';
  } else if (!ESTADOS_EVENTO_EDITABLES.includes(estado)) {
    throw new EventoInvalido('Estado de evento no válido.');
  } else {
    estadoValor = estado;
  }

  // --- Concurso ------------------------------------------------------------------
  let concurso = null;
  if (es_concurso) {
    const mod = modalidad || 'individual';
    if (!MODALIDADES.includes(mod)) throw new EventoInvalido("La modalidad debe ser 'individual' o 'equipos'.");

    if (mod === 'equipos') {
      if (tipo && !tipo.permite_equipos) {
        throw new EventoInvalido(
          `El tipo «${tipo.nombre || 'elegido'}» no admite inscripción por equipos. Elige un tipo que la permita (Concurso, Hackathon) o la modalidad individual.`,
        );
      }
      const minInt = parseInt(min_integrantes_equipo, 10);
      const maxInt = parseInt(max_integrantes_equipo, 10);
      if (!Number.isInteger(minInt) || minInt < MIN_INTEGRANTES_EQUIPO) {
        throw new EventoInvalido(`El mínimo de integrantes por equipo debe ser al menos ${MIN_INTEGRANTES_EQUIPO}.`);
      }
      if (!Number.isInteger(maxInt) || maxInt < minInt) {
        throw new EventoInvalido('El máximo de integrantes no puede ser menor que el mínimo.');
      }
      if (maxInt > MAX_INTEGRANTES_EQUIPO) {
        throw new EventoInvalido(`El máximo de integrantes por equipo no puede superar ${MAX_INTEGRANTES_EQUIPO}.`);
      }
      concurso = {
        modalidad: 'equipos',
        min_integrantes_equipo: minInt,
        max_integrantes_equipo: maxInt,
        requiere_asesor: Boolean(requiere_asesor),
        asesor_participa: Boolean(asesor_participa),
        max_asesores: acotarMaxAsesores(max_asesores),
      };
    } else {
      // Los asesores son una figura de EQUIPO: en modalidad individual no hay
      // nada que pedir, así que se apagan aunque el formulario los mande.
      concurso = {
        modalidad: 'individual',
        min_integrantes_equipo: 1,
        max_integrantes_equipo: null,
        requiere_asesor: false,
        asesor_participa: false,
        max_asesores: 1,
      };
    }

    const idPlat = parseInt(id_plataforma, 10);
    concurso.id_plataforma = Number.isInteger(idPlat) && idPlat > 0 ? idPlat : null;

    const url = String(url_concurso || '').trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      throw new EventoInvalido('La URL del concurso debe empezar por http:// o https://.');
    }
    if (url.length > 500) throw new EventoInvalido('La URL del concurso es demasiado larga.');
    concurso.url_concurso = url || null;
  }

  return {
    evento: {
      nombre: nombreLimpio,
      descripcion_html: descripcion_html ?? '',
      id_tipo_evento: idTipo,
      id_alcance: idAlcance,
      fecha_inicio: String(fecha_inicio),
      fecha_fin: fechaFin,
      fecha_limite_registro: limite,
      hora_inicio: hhmm(hora_inicio),
      hora_fin: hhmm(hora_fin),
      ubicacion: String(ubicacion || '').trim() || null,
      cupos: cuposValor,
      tiene_costo: tieneCosto,
      costo: costoValor,
      // Sin costo no hay nada que pagar: guardar instrucciones ahí sólo
      // serviría para que reaparecieran si algún día se marca el cobro.
      instrucciones_pago: tieneCosto ? (String(instrucciones_pago || '').trim() || null) : null,
      solicitar_talla: Boolean(solicitar_talla),
      asignar_mesas: Boolean(asignar_mesas),
      // varchar(60) en `evento.slug`: el recorte lo hace el helper.
      slug: slug === undefined ? undefined : (slugificar(slug, 60) || null),
      estado: estadoValor,
    },
    concurso,
  };
}

/** Valor por defecto del máximo de integrantes (formularios sin dato). */
export const MAX_INTEGRANTES_SUGERIDO = MAX_INTEGRANTES_POR_DEFECTO;

/**
 * Traduce un error de CHECK/FK/UNIQUE de Postgres a un mensaje para el
 * administrador, o null si no es uno de los conocidos.
 */
export function mensajeErrorEvento(error) {
  if (error?.code === '23514') {
    const c = error.constraint || '';
    if (c.includes('costo')) return 'Si el evento tiene costo, el costo debe ser mayor a 0 (y 0 si no tiene costo).';
    if (c.includes('cupos')) return 'El aforo debe ser mayor a 0.';
    if (c.includes('fecha')) return 'La fecha de fin debe ser igual o posterior a la de inicio.';
    if (c.includes('hora')) return 'En eventos de un mismo día, la hora de fin debe ser posterior a la de inicio.';
    if (c.includes('modalidad') || c.includes('integrantes')) return 'Configuración de concurso inválida: en modalidad por equipos el máximo de integrantes debe ser ≥ 2.';
    if (c.includes('estado')) return 'Estado de evento no válido.';
    return 'Datos del evento inválidos.';
  }
  if (error?.code === '23503') return 'Tipo de evento, alcance o plataforma inválidos.';
  if (error?.code === '23505' && String(error.constraint || '').includes('slug')) {
    return 'Ya hay otro evento usando ese identificador de página. Elige uno distinto.';
  }
  return null;
}
