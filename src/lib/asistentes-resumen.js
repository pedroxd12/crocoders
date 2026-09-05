// Cálculos sobre la lista de inscritos que comparten el panel de administración
// y el de staff: personas por fila, resumen (tallas, llegadas, pagos, retos),
// filtros, búsqueda y exportación a CSV.
//
// Trabaja sobre las filas que devuelve `listarAsistentesEvento`
// (src/lib/eventos-asistentes.js) y no toca la base de datos: se importa desde
// componentes de cliente.
//
// UNIDADES. Una fila es una INSCRIPCIÓN: una persona en eventos individuales,
// un equipo en concursos por equipos. Las tallas, las llegadas y las playeras
// se cuentan por PERSONA (integrantes + asesores del equipo), que es la unidad
// con la que se piden playeras y se pasa lista. Los asesores reciben playera
// pero no cuentan como asistencia del evento (mismo criterio que el agregado
// `inscripcion_evento.asistio`, ver migración 009).

import { TALLAS_PLAYERA } from '@/lib/registro-campos';

export function esEquipo(fila) {
  return fila?.tipo === 'equipo' || fila?.tipo_usuario === 'Equipo' || fila?.id_equipo != null;
}

export const ETIQUETA_ROL_PERSONA = Object.freeze({
  participante: 'Participante',
  capitan: 'Capitán',
  integrante: 'Integrante',
  asesor: 'Asesor',
});

/**
 * Personas físicas de una fila, en una forma homogénea: la propia persona en
 * una inscripción individual; integrantes (capitán primero) y asesores en un
 * equipo.
 */
export function personasDeFila(fila) {
  if (!esEquipo(fila)) {
    return [
      {
        clave: `p-${fila.id_inscripcion}`,
        rol: 'participante',
        nombre: fila.nombre_completo,
        correo: fila.correo,
        tipo: fila.tipo || (fila.tipo_usuario || '').toLowerCase(),
        institucion: fila.institucion ?? null,
        talla_playera: fila.talla_playera ?? null,
        asistio: Boolean(fila.asistio),
        playera_entregada: Boolean(fila.playera_entregada),
        cuentaAsistencia: true,
      },
    ];
  }

  const integrantes = Array.isArray(fila.equipo?.integrantes) ? fila.equipo.integrantes : [];
  const asesores = Array.isArray(fila.equipo?.asesores) ? fila.equipo.asesores : [];
  return [
    ...integrantes.map((p) => ({
      clave: `i-${p.id}`,
      rol: p.es_capitan ? 'capitan' : 'integrante',
      nombre: p.nombre,
      correo: p.correo,
      tipo: p.tipo,
      institucion: p.institucion ?? null,
      talla_playera: p.talla_playera ?? null,
      asistio: Boolean(p.asistio),
      playera_entregada: Boolean(p.playera_entregada),
      cuentaAsistencia: true,
    })),
    ...asesores.map((p) => ({
      clave: `a-${p.id}`,
      rol: 'asesor',
      nombre: p.nombre,
      correo: p.correo,
      tipo: 'asesor',
      institucion: null,
      talla_playera: p.talla_playera ?? null,
      asistio: Boolean(p.asistio),
      playera_entregada: Boolean(p.playera_entregada),
      cuentaAsistencia: false,
    })),
  ];
}

/** Totales de la lista. Todo lo que es "por persona" recorre `personasDeFila`. */
export function resumenAsistentes(filas) {
  const lista = Array.isArray(filas) ? filas : [];
  const resumen = {
    inscripciones: lista.length,
    equipos: 0,
    porTipo: { miembro: 0, invitado: 0, equipo: 0 },
    personas: 0, // participantes e integrantes (ocupan lugar)
    asesores: 0,
    asistieron: 0, // personas con llegada registrada (asesores fuera)
    tallas: Object.fromEntries(TALLAS_PLAYERA.map((t) => [t, 0])),
    sinTalla: 0,
    playerasTotal: 0, // personas + asesores
    playerasEntregadas: 0,
    conCosto: 0,
    pagados: 0,
    pagosPendientes: 0,
    comprobantesPendientes: 0,
    sinComprobante: 0,
    porReto: [],
  };
  const retos = new Map();

  for (const fila of lista) {
    const tipo = fila.tipo || (fila.tipo_usuario || '').toLowerCase();
    if (tipo in resumen.porTipo) resumen.porTipo[tipo] += 1;
    if (esEquipo(fila)) resumen.equipos += 1;

    if (fila.requiere_pago) {
      resumen.conCosto += 1;
      if (fila.pago_completado) resumen.pagados += 1;
      else resumen.pagosPendientes += 1;
      if (fila.comprobante_estado === 'pendiente') resumen.comprobantesPendientes += 1;
      if (!fila.id_comprobante) resumen.sinComprobante += 1;
    }

    let reto = null;
    if (fila.id_reto != null) {
      const clave = String(fila.id_reto);
      reto = retos.get(clave) || {
        id_reto: fila.id_reto,
        titulo: fila.reto_titulo || `Desafío ${fila.id_reto}`,
        inscripciones: 0,
        personas: 0,
      };
      reto.inscripciones += 1;
      retos.set(clave, reto);
    }

    for (const persona of personasDeFila(fila)) {
      if (persona.rol === 'asesor') {
        resumen.asesores += 1;
      } else {
        resumen.personas += 1;
        if (reto) reto.personas += 1;
      }
      if (persona.cuentaAsistencia && persona.asistio) resumen.asistieron += 1;
      resumen.playerasTotal += 1;
      if (persona.playera_entregada) resumen.playerasEntregadas += 1;
      if (persona.talla_playera && persona.talla_playera in resumen.tallas) {
        resumen.tallas[persona.talla_playera] += 1;
      } else {
        resumen.sinTalla += 1;
      }
    }
  }

  resumen.porReto = [...retos.values()].sort((a, b) => b.inscripciones - a.inscripciones);
  return resumen;
}

/* ------------------------------------------------------------- filtros */

const FILTROS = [
  { value: 'asistieron', label: 'Con llegada registrada' },
  { value: 'sin_asistir', label: 'Sin llegada registrada' },
  { value: 'pago_pendiente', label: 'Pago pendiente', requiere: 'costo' },
  { value: 'comprobante_pendiente', label: 'Comprobante por revisar', requiere: 'costo' },
  { value: 'sin_talla', label: 'Falta alguna talla', requiere: 'talla' },
  { value: 'playera_pendiente', label: 'Playera sin entregar', requiere: 'talla' },
  { value: 'sin_mesa', label: 'Sin mesa asignada', requiere: 'mesas' },
];

/** Filtros que tienen sentido para este evento (según costo y talla). */
export function filtrosDisponibles(evento) {
  return FILTROS.filter(
    (f) =>
      !f.requiere ||
      (f.requiere === 'costo' && evento?.tiene_costo) ||
      (f.requiere === 'talla' && evento?.solicitar_talla) ||
      (f.requiere === 'mesas' && evento?.asignar_mesas),
  );
}

export function aplicarFiltro(filas, filtro) {
  const lista = Array.isArray(filas) ? filas : [];
  switch (filtro) {
    case 'asistieron':
      return lista.filter((f) => Boolean(f.asistio));
    case 'sin_asistir':
      return lista.filter((f) => !f.asistio);
    case 'pago_pendiente':
      return lista.filter((f) => f.requiere_pago && !f.pago_completado);
    case 'comprobante_pendiente':
      return lista.filter((f) => f.comprobante_estado === 'pendiente');
    case 'sin_talla':
      // Los asesores no entran: su talla es opcional al inscribirse.
      return lista.filter((f) => personasDeFila(f).some((p) => p.rol !== 'asesor' && !p.talla_playera));
    case 'playera_pendiente':
      return lista.filter((f) => personasDeFila(f).some((p) => !p.playera_entregada));
    case 'sin_mesa':
      return lista.filter((f) => !f.mesa);
    default:
      return lista;
  }
}

/**
 * Búsqueda por nombre, correo o número IEEE. En un equipo también busca entre
 * sus integrantes y asesores: teclear el nombre de un integrante encuentra a
 * su equipo.
 */
export function coincideBusqueda(fila, termino) {
  const q = (termino || '').trim().toLowerCase();
  if (!q) return true;
  if (fila.nombre_completo?.toLowerCase().includes(q)) return true;
  if (fila.correo?.toLowerCase().includes(q)) return true;
  if (fila.numero_ieee && String(fila.numero_ieee).includes(q)) return true;
  if (fila.reto_titulo?.toLowerCase().includes(q)) return true;
  if (fila.mesa && String(fila.mesa).toLowerCase().includes(q)) return true;
  if (!esEquipo(fila)) return false;
  return personasDeFila(fila).some(
    (p) => p.nombre?.toLowerCase().includes(q) || p.correo?.toLowerCase().includes(q),
  );
}

/* ----------------------------------------------------------------- CSV */

const ETIQUETA_TIPO_PERSONA = {
  miembro: 'Miembro del club',
  invitado: 'Invitado',
  asesor: 'Asesor',
};

/**
 * Filas para exportar: UNA POR PERSONA (no por inscripción), que es lo que se
 * necesita para pedir playeras, imprimir gafetes o pasar lista en la mesa.
 * Las columnas de talla, pago y desafío sólo aparecen si el evento las usa.
 */
export function filasCsvAsistentes(filas, { conTalla = false, conCosto = false, conRetos = false, conMesas = false } = {}) {
  const cabeceras = [
    'Inscripción',
    'Tipo de inscripción',
    'Persona',
    'Rol',
    'Correo',
    'Origen',
    'Institución',
    ...(conRetos ? ['Desafío'] : []),
    ...(conMesas ? ['Mesa'] : []),
    ...(conTalla ? ['Talla', 'Playera entregada'] : []),
    'Llegó',
    ...(conCosto ? ['Pago', 'Comprobante'] : []),
    'Inscrito el',
  ];
  const si = (v) => (v ? 'Sí' : 'No');
  const fecha = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('es-MX');
  };

  const filasCsv = [];
  for (const fila of Array.isArray(filas) ? filas : []) {
    const tipoInscripcion = fila.tipo_usuario || fila.tipo || '';
    for (const p of personasDeFila(fila)) {
      filasCsv.push([
        fila.nombre_completo || '',
        tipoInscripcion,
        p.nombre || '',
        ETIQUETA_ROL_PERSONA[p.rol] || p.rol,
        p.correo || '',
        ETIQUETA_TIPO_PERSONA[p.tipo] || p.tipo || '',
        p.institucion || '',
        ...(conRetos ? [fila.reto_titulo || ''] : []),
        ...(conMesas ? [fila.mesa || ''] : []),
        ...(conTalla ? [p.talla_playera || '', si(p.playera_entregada)] : []),
        si(p.asistio),
        ...(conCosto
          ? [
              fila.requiere_pago ? (fila.pago_completado ? 'Pagado' : 'Pendiente') : 'Gratuito',
              fila.id_comprobante ? fila.comprobante_estado || '' : 'Sin subir',
            ]
          : []),
        fecha(fila.fecha_inscripcion),
      ]);
    }
  }
  return { cabeceras, filas: filasCsv };
}

/** Descarga un CSV en el navegador. Con BOM para que Excel respete los acentos. */
export function descargarCsv(nombreArchivo, cabeceras, filas) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const contenido = [cabeceras, ...filas].map((fila) => fila.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

/** Nombre de archivo seguro: "inscritos_coding-cup_2026-09-02.csv". */
export function nombreArchivoCsv(nombreEvento) {
  const base =
    (nombreEvento || 'evento')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'evento';
  return `inscritos_${base}_${new Date().toISOString().split('T')[0]}.csv`;
}
