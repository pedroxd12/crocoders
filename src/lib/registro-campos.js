// Catálogos compartidos del formulario de inscripción (cliente y servidor).
//
// Viven aquí y no en cada formulario porque los usan TRES pantallas (listado de
// eventos, detalle de evento y programas) además de la validación zod del
// servidor: duplicarlos es lo que hacía que el listado ofreciera un catálogo de
// carreras y el detalle un campo libre. Los valores de `NIVELES_ESTUDIO` y
// `TALLAS_PLAYERA` coinciden con los CHECK de la tabla `invitado`
// (db/migrations/007_talla_edad_nivel_estudios.sql): cambiar uno exige cambiar
// el otro.

export const TALLAS_PLAYERA = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Institución en los formularios de inscripción (invitado individual e
// integrantes de equipo): se ELIGE si la persona es del ITLAC o de otra
// institución. Con ITLAC la carrera sale de este catálogo y se pide número de
// control; con otra institución la carrera es texto libre y opcional.
export const ITLAC_NOMBRE = 'Instituto Tecnológico de Lázaro Cárdenas';

export const INSTITUCION_OPCIONES = [
  { value: 'itlac', label: ITLAC_NOMBRE },
  { value: 'otra', label: 'Otra institución' },
];

// Único origen del catálogo de carreras del ITLAC. Es la misma lista del
// registro de miembros (/iniciar la importa de aquí); si el instituto abre una
// carrera, se agrega en este único lugar.
export const CARRERAS_ITLAC = [
  'Ingeniería en Sistemas Computacionales',
  'Ingeniería en Electrónica',
  'Ingeniería Industrial',
  'Ingeniería Química',
  'Ingeniería en Logística',
  'Ingeniería en Mecatrónica',
];

export const NIVELES_ESTUDIO = [
  { value: 'secundaria', label: 'Secundaria' },
  { value: 'preparatoria', label: 'Preparatoria / Bachillerato' },
  { value: 'universidad', label: 'Universidad' },
  { value: 'maestria', label: 'Maestría / Posgrado' },
  { value: 'otro', label: 'Otro' },
];

export const NIVELES_ESTUDIO_VALUES = NIVELES_ESTUDIO.map((n) => n.value);

// Cómo se pregunta "¿qué estudias?" según el nivel. En secundaria/preparatoria
// no existe "carrera", y en posgrado se llama programa: usar siempre la palabra
// "Carrera" hacía que esos invitados dejaran el campo vacío o inventaran algo.
export const CAMPO_ESTUDIOS_POR_NIVEL = {
  universidad: { label: 'Carrera', placeholder: 'Ej. Ingeniería en Sistemas Computacionales', requerido: true, conSemestre: true },
  maestria: { label: 'Programa de posgrado', placeholder: 'Ej. Maestría en Ciencias de la Computación', requerido: true, conSemestre: false },
  preparatoria: { label: 'Área o bachillerato', placeholder: 'Ej. Físico-matemático', requerido: false, conSemestre: false },
  secundaria: null, // no aplica
  otro: { label: '¿Qué estudias o a qué te dedicas?', placeholder: 'Cuéntanos brevemente', requerido: false, conSemestre: false },
};

export const SEMESTRES = Array.from({ length: 14 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}° Semestre`,
}));
