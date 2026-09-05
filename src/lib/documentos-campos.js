// Catálogo de las plantillas de documentos (certificados, gafetes y
// reconocimientos): tipos, audiencias, campos que se pueden colocar sobre el
// PDF, fuentes y diseños sugeridos. Es puro (sin base de datos) porque lo
// consumen el editor del panel y el generador del servidor por igual: si
// divergieran, el editor ofrecería campos que el PDF no sabe pintar.
//
// COORDENADAS: `x`, `y` y `ancho` son PORCENTAJES de la página (0–100), con
// origen arriba a la izquierda como en cualquier editor. El generador los
// convierte a puntos PDF (origen abajo a la izquierda). Así una plantilla
// carta y una A4 se colocan igual.

export const TIPOS_PLANTILLA = [
  { value: 'certificado', label: 'Certificado o constancia' },
  { value: 'gafete', label: 'Gafete' },
  { value: 'reconocimiento', label: 'Reconocimiento (ganadores)' },
];

export const ETIQUETA_TIPO_PLANTILLA = Object.fromEntries(TIPOS_PLANTILLA.map((t) => [t.value, t.label]));

/** A quién se le genera el documento, por ámbito. */
export const AUDIENCIAS = {
  evento: [
    { value: 'participantes', label: 'Participantes (inscritos, integrantes y asesores)' },
    { value: 'staff', label: 'Staff del evento' },
    { value: 'jueces', label: 'Jueces' },
    { value: 'ganadores', label: 'Ganadores (equipo y cada integrante)' },
  ],
  programa: [
    { value: 'participantes', label: 'Participantes del programa' },
  ],
};

export const ETIQUETA_AUDIENCIA = Object.fromEntries(
  [...AUDIENCIAS.evento, ...AUDIENCIAS.programa].map((a) => [a.value, a.label]),
);

/** Datos que se pueden colocar. `clave` es lo que se guarda en `campos`. */
export const CAMPOS_DISPONIBLES = [
  { clave: 'nombre', label: 'Nombre de la persona', ejemplo: 'María Fernanda López Ruiz' },
  { clave: 'equipo', label: 'Nombre del equipo', ejemplo: 'Los Cocodrilos' },
  { clave: 'rol', label: 'Rol (Participante, Capitán, Staff, Juez…)', ejemplo: 'Participante' },
  { clave: 'institucion', label: 'Institución', ejemplo: 'Instituto Tecnológico de Lázaro Cárdenas' },
  { clave: 'correo', label: 'Correo electrónico', ejemplo: 'maria@ejemplo.com' },
  { clave: 'evento', label: 'Nombre del evento o programa', ejemplo: 'HackaItlac 2026' },
  { clave: 'fecha', label: 'Fecha del evento', ejemplo: '8 de octubre de 2026' },
  { clave: 'desafio', label: 'Desafío', ejemplo: 'Clasificación arancelaria' },
  { clave: 'lugar', label: 'Lugar obtenido', ejemplo: '1er lugar' },
  { clave: 'premio', label: 'Premio', ejemplo: '$15,000 MXN' },
  { clave: 'mesa', label: 'Mesa asignada', ejemplo: 'Mesa 12' },
  { clave: 'folio', label: 'Folio', ejemplo: 'HCK-2026-001' },
  { clave: 'texto', label: 'Texto fijo (se escribe aquí)', ejemplo: 'Se otorga la presente constancia a' },
  { clave: 'qr', label: 'Código QR del ticket (gafetes)', ejemplo: null },
];

export const ETIQUETA_CAMPO = Object.fromEntries(CAMPOS_DISPONIBLES.map((c) => [c.clave, c.label]));
export const CLAVES_CAMPO = CAMPOS_DISPONIBLES.map((c) => c.clave);

/** Fuentes estándar de PDF (no necesitan incrustar archivos). */
export const FUENTES = [
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Helvetica-Bold', label: 'Helvetica negrita' },
  { value: 'Helvetica-Oblique', label: 'Helvetica cursiva' },
  { value: 'Times-Roman', label: 'Times' },
  { value: 'Times-Bold', label: 'Times negrita' },
  { value: 'Times-Italic', label: 'Times cursiva' },
  { value: 'Courier', label: 'Courier' },
  { value: 'Courier-Bold', label: 'Courier negrita' },
];
export const FUENTES_VALIDAS = FUENTES.map((f) => f.value);

export const ALINEACIONES = [
  { value: 'izquierda', label: 'Izquierda' },
  { value: 'centro', label: 'Centrado' },
  { value: 'derecha', label: 'Derecha' },
];

export const LIMITES = Object.freeze({
  campos: 40,
  tamanoMin: 4,
  tamanoMax: 200,
  qrMin: 5,
  qrMax: 80,
});

const clamp = (v, min, max, porDefecto) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, n));
};

/** Campo nuevo con valores razonables. */
export function campoNuevo(clave = 'nombre', parcial = {}) {
  const esQr = clave === 'qr';
  return {
    clave,
    x: 50,
    y: 50,
    tamano: esQr ? 22 : 18,
    fuente: 'Helvetica-Bold',
    color: '#111111',
    alineacion: 'centro',
    // Ancho máximo del texto (% del ancho de página); 0 = sin límite. Si el
    // texto no cabe, el generador reduce la fuente hasta que quepa.
    ancho: esQr ? 0 : 80,
    mayusculas: false,
    texto: '',
    ...parcial,
  };
}

/**
 * Sanea una lista de campos venida del cliente (o de la base): claves
 * conocidas, números acotados, colores en hex. Descarta lo que no sirve.
 */
export function normalizarCampos(campos) {
  if (!Array.isArray(campos)) return [];
  return campos
    .filter((c) => c && CLAVES_CAMPO.includes(c.clave))
    .slice(0, LIMITES.campos)
    .map((c) => {
      const esQr = c.clave === 'qr';
      const base = campoNuevo(c.clave);
      return {
        clave: c.clave,
        x: clamp(c.x, 0, 100, base.x),
        y: clamp(c.y, 0, 100, base.y),
        tamano: esQr
          ? clamp(c.tamano, LIMITES.qrMin, LIMITES.qrMax, base.tamano)
          : clamp(c.tamano, LIMITES.tamanoMin, LIMITES.tamanoMax, base.tamano),
        fuente: FUENTES_VALIDAS.includes(c.fuente) ? c.fuente : base.fuente,
        color: /^#[0-9a-fA-F]{6}$/.test(String(c.color || '')) ? String(c.color).toLowerCase() : base.color,
        alineacion: ALINEACIONES.some((a) => a.value === c.alineacion) ? c.alineacion : base.alineacion,
        ancho: clamp(c.ancho, 0, 100, base.ancho),
        mayusculas: Boolean(c.mayusculas),
        texto: c.clave === 'texto' ? String(c.texto || '').slice(0, 300) : '',
      };
    });
}

/**
 * Diseños sugeridos por tipo, para no arrancar con la hoja en blanco. Están
 * pensados para una hoja horizontal (certificados y reconocimientos) o para
 * un gafete vertical; el admin los ajusta después.
 */
export const PRESETS = {
  certificado: [
    campoNuevo('nombre', { y: 46, tamano: 30 }),
    campoNuevo('texto', { y: 56, tamano: 12, fuente: 'Helvetica', texto: 'por su participación en' }),
    campoNuevo('evento', { y: 62, tamano: 16 }),
    campoNuevo('fecha', { y: 70, tamano: 11, fuente: 'Helvetica' }),
    campoNuevo('folio', { x: 96, y: 96, tamano: 8, fuente: 'Courier', alineacion: 'derecha', ancho: 0 }),
  ],
  gafete: [
    campoNuevo('nombre', { y: 38, tamano: 22, ancho: 90 }),
    campoNuevo('rol', { y: 46, tamano: 12, fuente: 'Helvetica' }),
    campoNuevo('equipo', { y: 52, tamano: 12, fuente: 'Helvetica-Oblique' }),
    campoNuevo('mesa', { y: 58, tamano: 11, fuente: 'Helvetica' }),
    campoNuevo('qr', { y: 78, tamano: 34 }),
  ],
  reconocimiento: [
    campoNuevo('nombre', { y: 44, tamano: 30 }),
    campoNuevo('lugar', { y: 54, tamano: 18, color: '#15c46e' }),
    campoNuevo('desafio', { y: 61, tamano: 14, fuente: 'Helvetica' }),
    campoNuevo('equipo', { y: 67, tamano: 13, fuente: 'Helvetica-Oblique' }),
    campoNuevo('evento', { y: 74, tamano: 12, fuente: 'Helvetica' }),
    campoNuevo('folio', { x: 96, y: 96, tamano: 8, fuente: 'Courier', alineacion: 'derecha', ancho: 0 }),
  ],
};

/** Persona de muestra para la vista previa del editor. */
export function personaDeMuestra(contexto = {}) {
  return {
    clave: 'muestra',
    nombre: 'María Fernanda López Ruiz',
    correo: 'maria@ejemplo.com',
    institucion: 'Instituto Tecnológico de Lázaro Cárdenas',
    rol: 'Participante',
    equipo: 'Los Cocodrilos',
    desafio: 'Clasificación arancelaria',
    lugar: '1er lugar',
    premio: '$15,000 MXN',
    mesa: 'Mesa 12',
    folio: 'MUESTRA-001',
    evento: contexto.evento || 'Nombre del evento',
    fecha: contexto.fecha || '8 de octubre de 2026',
    qrToken: 'MUESTRA',
  };
}
