'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import styles from './hackaitlac.module.css';
import HackNav from './HackNav';
import HeroSection from './HeroSection';
import ScrollSection from './ScrollSection';
import ChallengeStack from './ChallengeStack';
import ScheduleSection from './ScheduleSection';
import ClosingSection from './ClosingSection';
import { acquireScroll, releaseScroll, refreshScroll } from './scroll-engine';

/* ── Desafíos (convocatoria HackaItlac 2026) ─────────────────────────────── */
const CRITERIOS = [
  'Propuesta de valor: pertinencia, relevancia, beneficios y distinción',
  'Grado de solución al desafío planteado',
  'Innovación por el uso de tecnología: datos abiertos, ciencia de datos, IA',
  'Potencial de escalabilidad',
  'Y lo que consideren los especialistas del desafío',
];

const challenges = [
  {
    id: 'arancelaria',
    tone: 1,
    index: '01',
    title: 'Clasificación arancelaria',
    lede: 'Un algoritmo que determine la fracción arancelaria de un producto.',
    resumen:
      'Una fracción mal asignada cuesta multas y mercancía detenida en aduana. Automatizar esa decisión es el reto.',
    body: 'Diseña y prueba un algoritmo capaz de determinar automáticamente la clasificación arancelaria de un producto a partir de sus características. Es un problema real del comercio exterior: una fracción mal asignada cuesta tiempo, multas y mercancía detenida en aduana.',
    entregable:
      'Prototipo funcional que reciba la descripción de un producto y devuelva su clasificación, con evidencia de las pruebas realizadas sobre casos reales.',
    patrocinador: 'Sector aduanal',
    tags: ['IA', 'Ciencia de datos', 'Comercio exterior'],
    criteria: CRITERIOS,
  },
  {
    id: 'alerta-ciudadana',
    tone: 2,
    index: '02',
    title: 'Alerta ciudadana',
    lede: 'Un sistema inteligente de alerta para la seguridad de la ciudad.',
    resumen:
      'Reportar y avisar en segundos, desde la calle y con mala señal. Tiene que servirle a cualquiera, no sólo a quien sabe usarlo.',
    body: 'Diseña un sistema inteligente de alerta ciudadana: que la gente pueda reportar incidentes y recibir avisos de forma rápida y confiable. Piensa en quién lo va a usar en la calle, con prisa y con mala señal.',
    entregable:
      'Prototipo funcional del sistema de reporte y notificación, probado durante el evento con casos de uso concretos.',
    patrocinador: 'Seguridad pública municipal',
    tags: ['Móvil', 'Tiempo real', 'Geolocalización'],
    criteria: CRITERIOS,
  },
  {
    id: 'resguardo-industrial',
    tone: 3,
    index: '03',
    title: 'Resguardo de equipo industrial',
    lede: 'Una plataforma web para registrar, rastrear y controlar equipo.',
    resumen:
      'Alta y baja de activos, asignación, ubicación e historial. Que nadie tenga que perseguir una herramienta por radio.',
    body: 'Desarrolla una plataforma web para el resguardo de equipo industrial: alta y baja de activos, asignación a personal, ubicación, historial de movimientos y reportes de estado. El objetivo es que nadie tenga que perseguir una herramienta por radio.',
    entregable:
      'Plataforma web funcional con el flujo completo de resguardo y devolución, más los reportes básicos de inventario.',
    patrocinador: 'Industria del puerto',
    tags: ['Web', 'Inventario', 'Trazabilidad'],
    criteria: CRITERIOS,
  },
  {
    id: 'despacho-agua',
    tone: 4,
    index: '04',
    title: 'Despacho automático de agua',
    lede: 'Automatizar el despacho de agua cruda en CAPALAC.',
    resumen:
      'Sensado, control del flujo y registro de cada despacho de agua cruda, con monitoreo de lo que pasa en la toma.',
    body: 'Crea un sistema para el despacho automático de agua cruda en la Comisión de Agua Potable y Alcantarillado de Lázaro Cárdenas. Sensado, control del flujo, registro de cada despacho y monitoreo de lo que está pasando en la toma.',
    entregable:
      'Prototipo funcional —software y, si aplica, hardware— que ejecute y registre un ciclo completo de despacho.',
    patrocinador: 'CAPALAC',
    tags: ['IoT', 'Automatización', 'Sensores'],
    criteria: CRITERIOS,
  },
  {
    id: 'imagen-urbana',
    tone: 5,
    index: '05',
    title: 'Imagen urbana',
    lede: 'Una propuesta de imagen urbana para Lázaro Cárdenas.',
    resumen:
      'Diseño urbano apoyado en tecnología: visualización, participación ciudadana y una propuesta ejecutable por etapas.',
    body: 'Desarrolla una propuesta para el diseño de la imagen urbana de la Ciudad de Lázaro Cárdenas, Michoacán. Aquí la tecnología acompaña al diseño: visualización, participación ciudadana y una propuesta que se pueda ejecutar por etapas.',
    entregable:
      'Propuesta de diseño acompañada de un prototipo que la comunique: maqueta digital, visualización interactiva o herramienta de consulta.',
    patrocinador: 'Gobierno municipal',
    tags: ['Diseño', 'Visualización', 'Ciudad'],
    criteria: CRITERIOS,
  },
];

/* ── Bases de participación ─────────────────────────────────────────────── */
const rules = [
  {
    num: '01',
    title: 'Equipos de 5 + asesor',
    text: 'Cinco integrantes sin contar al asesor, que acompaña al equipo pero no participa en la presentación: esa la hacen estrictamente los estudiantes.',
  },
  {
    num: '02',
    title: 'Estudiantes inscritos',
    text: 'Requisito indispensable: estar inscrito en una institución pública o privada de Educación Media Superior, Superior o Posgrado del país.',
  },
  {
    num: '03',
    title: 'Un equipo, un desafío',
    text: 'Cada estudiante pertenece a un único equipo y cada equipo se inscribe en un solo desafío. Un profesor sí puede asesorar a dos o más equipos.',
  },
  {
    num: '04',
    title: '24 horas sin dejar la mesa',
    text: 'El evento dura 24 horas continuas. Durante el desarrollo la mesa no puede quedarse sin participantes o el equipo queda descalificado.',
  },
  {
    num: '05',
    title: 'Libertad tecnológica',
    text: 'Ustedes eligen lenguajes, tecnologías y materiales. Cada equipo lleva su propio equipo de cómputo, herramientas y suministros personales.',
  },
  {
    num: '06',
    title: 'Sede y logística',
    text: 'El comité proporciona área de trabajo con conexión a internet y zona de descanso en el Gimnasio Auditorio del ITLAC.',
  },
  {
    num: '07',
    title: 'Informe técnico',
    text: 'Cada equipo entrega un informe en PDF sobre el proceso y el resultado, para integrar la memoria técnica del evento.',
  },
  {
    num: '08',
    title: 'Constancia y vinculación',
    text: 'Todos reciben constancia digital descargable, y los proyectos pueden vincularse con el patrocinador del desafío mediante un resumen del prototipo.',
  },
];

/* ── Cronograma (tabla «Fechas importantes» de la convocatoria) ──────────── */
const scheduleStops = [
  {
    day: '01',
    month: 'Septiembre',
    time: '9:00',
    title: 'Apertura de registro',
    note: 'Se abre el registro de equipos.',
  },
  {
    day: '30',
    month: 'Septiembre',
    time: '23:59',
    title: 'Cierre de registro',
    note: 'O antes, si se agotan los espacios.',
    key: true,
  },
  {
    day: '08',
    month: 'Octubre',
    time: '8:00 – 10:00',
    title: 'Recepción de equipos',
    note: 'Instalación en el Gimnasio Auditorio.',
  },
  {
    day: '08',
    month: 'Octubre',
    time: '12:00',
    title: 'Arranca el hackatón',
    note: 'Empiezan las 24 horas.',
    key: true,
  },
  {
    day: '09',
    month: 'Octubre',
    time: '12:00 – 14:00',
    title: 'Exposición de propuestas',
    note: '5 min de exposición y 5 de preguntas.',
  },
  {
    day: '09',
    month: 'Octubre',
    time: '14:00',
    title: 'Premiación',
    note: 'Un ganador por desafío.',
    key: true,
  },
];

export default function HackaitlacLanding() {
  // El orquestador también reserva el motor: así el scroll suave sigue vivo
  // mientras la página esté montada, aunque una sección se desmonte.
  useEffect(() => {
    acquireScroll();

    // Las fuentes cambian la altura de los títulos y las imágenes la de las
    // secciones: sin este recálculo los triggers se quedan con las medidas
    // del primer render y el pin de los desafíos arranca fuera de sitio.
    let raf;
    const settle = () => {
      raf = requestAnimationFrame(refreshScroll);
    };
    if (document.fonts?.ready) document.fonts.ready.then(settle);
    window.addEventListener('load', settle);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('load', settle);
      releaseScroll();
    };
  }, []);

  return (
    <div className={styles.page} data-hackaitlac="">
      <HackNav />

      <HeroSection />

      {/* 2 — Sobre el evento */}
      <ScrollSection
        id="evento"
        theme="themePaper2"
        zIndex={2}
        label="El evento"
        heading="Veinticuatro horas para convertir un problema real en un prototipo que funciona."
      >
        <div className={styles.split}>
          <div className={styles.prose}>
            <p>
              El Instituto Tecnológico de Lázaro Cárdenas invita a estudiantes de instituciones
              públicas y privadas de Educación Media Superior, Superior y Posgrado de todo el país a
              la segunda edición del HackaItlac.
            </p>
            <p>
              No son ejercicios de clase: los cinco desafíos los ponen empresas, dependencias e
              instituciones de la región, y cada equipo tiene que entregar un prototipo funcional,
              desarrollado y probado durante el evento.
            </p>
          </div>
          <figure className={styles.splitMedia}>
            <Image
              src="/hackaitlac/edicion-2025.jpg"
              alt="Participantes de la primera edición del HackaItlac"
              fill
              sizes="(max-width: 820px) 92vw, 560px"
            />
            <figcaption className={styles.mediaCaption}>Primera edición · HackaItlac</figcaption>
          </figure>
        </div>

        <div className={styles.figures}>
          <div className={styles.figure}>
            <span className={styles.figureValue}>2ª</span>
            <span className={styles.figureLabel}>Edición</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureValue}>5</span>
            <span className={styles.figureLabel}>Desafíos</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureValue}>24 h</span>
            <span className={styles.figureLabel}>De desarrollo</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureValue}>6</span>
            <span className={styles.figureLabel}>Personas por equipo</span>
          </div>
        </div>
      </ScrollSection>

      {/* 3 — Objetivo (banda azul marino) */}
      <ScrollSection
        id="objetivo"
        theme="themeNavy"
        zIndex={3}
        label="Objetivo"
        heading="Impulsar la innovación tecnológica vinculando el talento estudiantil con retos reales de la industria, el gobierno y la sociedad."
      >
        <div className={styles.split}>
          <div className={styles.prose}>
            <p>
              El HackaItlac existe para que la colaboración entre estudiantes, empresas, gobierno e
              instituciones educativas produzca algo concreto: prototipos con potencial de
              continuidad, no presentaciones que se archivan.
            </p>
            <p>
              En el camino se ponen a prueba las habilidades que de verdad importan —innovación,
              programación, diseño y trabajo colaborativo bajo presión— y se fortalece el ecosistema
              tecnológico de la región.
            </p>
          </div>
          <div className={styles.figures} style={{ borderTop: 'none', paddingTop: 0 }}>
            <div className={styles.figure}>
              <span className={styles.figureValue}>$15k</span>
              <span className={styles.figureLabel}>MXN por desafío</span>
            </div>
            <div className={styles.figure}>
              <span className={styles.figureValue}>5 + 5</span>
              <span className={styles.figureLabel}>Min. de exposición y preguntas</span>
            </div>
            <div className={styles.figure}>
              <span className={styles.figureValue}>100 %</span>
              <span className={styles.figureLabel}>Con constancia digital</span>
            </div>
          </div>
        </div>
      </ScrollSection>

      {/* 4 — Bases */}
      <ScrollSection
        id="bases"
        theme="themePaper"
        zIndex={4}
        label="Bases"
        heading="Lo que necesitas saber antes de registrar a tu equipo."
      >
        <div className={styles.rules}>
          {rules.map((rule) => (
            <article className={styles.rule} key={rule.num}>
              <span className={styles.ruleNum}>{rule.num}</span>
              <h3 className={styles.ruleTitle}>{rule.title}</h3>
              <p className={styles.ruleText}>{rule.text}</p>
            </article>
          ))}
        </div>
      </ScrollSection>

      {/* 5 — Desafíos */}
      <ChallengeStack challenges={challenges} />

      {/* 6 — Cronograma */}
      <ScheduleSection stops={scheduleStops} zIndex={6} />

      {/* 7 — Premio, registro y pie */}
      <ClosingSection zIndex={7} />
    </div>
  );
}
