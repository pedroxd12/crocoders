/**
 * Contenido de respaldo de la sección de desafíos.
 *
 * Los desafíos REALES los publica un administrador desde
 * /admin/eventos/[id]/retos y llegan a la landing desde la base
 * (src/lib/hackaitlac.js). Esta lista es lo que se enseña cuando todavía no hay
 * ningún evento con `slug = 'hackaitlac'` o cuando la base no responde: es la
 * convocatoria 2026 tal y como se publicó, para que la página no se quede sin
 * su sección central.
 *
 * Al ser respaldo, sus tarjetas no tienen cupo ni enlace de registro (`href`
 * null): el botón cae al correo del comité, que es lo que había antes.
 */

const CRITERIOS = [
  'Propuesta de valor: pertinencia, relevancia, beneficios y distinción',
  'Grado de solución al desafío planteado',
  'Innovación por el uso de tecnología: datos abiertos, ciencia de datos, IA',
  'Potencial de escalabilidad',
  'Y lo que consideren los especialistas del desafío',
];

const PREMIO = '$15,000 MXN';

const base = (reto, i) => ({
  ...reto,
  index: String(i + 1).padStart(2, '0'),
  tone: i + 1,
  idReto: null,
  criteria: CRITERIOS,
  premio: PREMIO,
  imagen: null,
  cupo: null,
  ocupados: 0,
  disponibles: null,
  lleno: false,
  href: null,
});

export const DESAFIOS_FALLBACK = [
  {
    id: 'arancelaria',
    title: 'Clasificación arancelaria',
    lede: 'Un algoritmo que determine la fracción arancelaria de un producto.',
    resumen:
      'Una fracción mal asignada cuesta multas y mercancía detenida en aduana. Automatizar esa decisión es el reto.',
    body: 'Diseña y prueba un algoritmo capaz de determinar automáticamente la clasificación arancelaria de un producto a partir de sus características. Es un problema real del comercio exterior: una fracción mal asignada cuesta tiempo, multas y mercancía detenida en aduana.',
    entregable:
      'Prototipo funcional que reciba la descripción de un producto y devuelva su clasificación, con evidencia de las pruebas realizadas sobre casos reales.',
    patrocinador: 'Sector aduanal',
    tags: ['IA', 'Ciencia de datos', 'Comercio exterior'],
  },
  {
    id: 'alerta-ciudadana',
    title: 'Alerta ciudadana',
    lede: 'Un sistema inteligente de alerta para la seguridad de la ciudad.',
    resumen:
      'Reportar y avisar en segundos, desde la calle y con mala señal. Tiene que servirle a cualquiera, no sólo a quien sabe usarlo.',
    body: 'Diseña un sistema inteligente de alerta ciudadana: que la gente pueda reportar incidentes y recibir avisos de forma rápida y confiable. Piensa en quién lo va a usar en la calle, con prisa y con mala señal.',
    entregable:
      'Prototipo funcional del sistema de reporte y notificación, probado durante el evento con casos de uso concretos.',
    patrocinador: 'Seguridad pública municipal',
    tags: ['Móvil', 'Tiempo real', 'Geolocalización'],
  },
  {
    id: 'resguardo-industrial',
    title: 'Resguardo de equipo industrial',
    lede: 'Una plataforma web para registrar, rastrear y controlar equipo.',
    resumen:
      'Alta y baja de activos, asignación, ubicación e historial. Que nadie tenga que perseguir una herramienta por radio.',
    body: 'Desarrolla una plataforma web para el resguardo de equipo industrial: alta y baja de activos, asignación a personal, ubicación, historial de movimientos y reportes de estado. El objetivo es que nadie tenga que perseguir una herramienta por radio.',
    entregable:
      'Plataforma web funcional con el flujo completo de resguardo y devolución, más los reportes básicos de inventario.',
    patrocinador: 'Industria del puerto',
    tags: ['Web', 'Inventario', 'Trazabilidad'],
  },
  {
    id: 'despacho-agua',
    title: 'Despacho automático de agua',
    lede: 'Automatizar el despacho de agua cruda en CAPALAC.',
    resumen:
      'Sensado, control del flujo y registro de cada despacho de agua cruda, con monitoreo de lo que pasa en la toma.',
    body: 'Crea un sistema para el despacho automático de agua cruda en la Comisión de Agua Potable y Alcantarillado de Lázaro Cárdenas. Sensado, control del flujo, registro de cada despacho y monitoreo de lo que está pasando en la toma.',
    entregable:
      'Prototipo funcional —software y, si aplica, hardware— que ejecute y registre un ciclo completo de despacho.',
    patrocinador: 'CAPALAC',
    tags: ['IoT', 'Automatización', 'Sensores'],
  },
  {
    id: 'imagen-urbana',
    title: 'Imagen urbana',
    lede: 'Una propuesta de imagen urbana para Lázaro Cárdenas.',
    resumen:
      'Diseño urbano apoyado en tecnología: visualización, participación ciudadana y una propuesta ejecutable por etapas.',
    body: 'Desarrolla una propuesta para el diseño de la imagen urbana de la Ciudad de Lázaro Cárdenas, Michoacán. Aquí la tecnología acompaña al diseño: visualización, participación ciudadana y una propuesta que se pueda ejecutar por etapas.',
    entregable:
      'Propuesta de diseño acompañada de un prototipo que la comunique: maqueta digital, visualización interactiva o herramienta de consulta.',
    patrocinador: 'Gobierno municipal',
    tags: ['Diseño', 'Visualización', 'Ciudad'],
  },
].map(base);
