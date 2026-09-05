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
import { rangoEquipos } from '@/components/eventos/EventoBadges';

/* ── Bases de participación ─────────────────────────────────────────────── */
// La base 01 (tamaño del equipo) se redacta a partir del concurso configurado
// en el panel (mínimo, máximo y asesor): antes decía "Equipos de 5" a mano y
// la ficha del evento "de 3", según lo que tuviera la base en cada momento.
function baseTamanoEquipo(evento) {
  const min = Number(evento?.min_integrantes_equipo) || null;
  const max = Number(evento?.max_integrantes_equipo) || null;
  const conAsesor = Boolean(evento?.requiere_asesor) && !evento?.asesor_participa;
  if (!min && !max) {
    return {
      num: '01',
      title: 'Equipos de 5 + asesor',
      text: 'Cinco integrantes sin contar al asesor, que acompaña al equipo pero no participa en la presentación: esa la hacen estrictamente los estudiantes.',
    };
  }
  const rango = rangoEquipos(min, max); // "Equipos de 3 a 5 integrantes"
  const cuantos = !max ? `${min} o más integrantes` : min === max ? `${max} integrantes` : `entre ${min} y ${max} integrantes`;
  return {
    num: '01',
    title: conAsesor ? `${rango} + asesor` : rango,
    text: conAsesor
      ? `${cuantos.charAt(0).toUpperCase()}${cuantos.slice(1)} sin contar al asesor, que acompaña al equipo pero no participa en la presentación: esa la hacen estrictamente los estudiantes.`
      : `${cuantos.charAt(0).toUpperCase()}${cuantos.slice(1)} por equipo.`,
  };
}

const rules = [
  null, // la 01 se calcula con el evento (baseTamanoEquipo)
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

/** Números en palabra para el titular de la sección de desafíos. */
const NUMERALES = ['Cero', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'];

/**
 * Landing del HackaItlac.
 *
 * `challenges` y `evento` los sirve el Server Component (src/app/hackaitlac/page.js)
 * desde el evento que el panel marcó con `slug = 'hackaitlac'`. Cuando no hay
 * ninguno, llegan los desafíos de respaldo y `evento` es null: la página se ve
 * igual, pero sin cupos ni registro en línea.
 */
export default function HackaitlacLanding({ challenges = [], evento = null }) {
  const totalDesafios = challenges.length;

  // Integrantes por equipo que se anuncian ("3–5"), tal como los configuró el
  // panel. Sin evento configurado se mantiene la cifra de la convocatoria
  // impresa. El asesor va aparte: lo explica la base 01.
  const minIntegrantes = Number(evento?.min_integrantes_equipo) || null;
  const maxIntegrantes = Number(evento?.max_integrantes_equipo) || null;
  const integrantesPorEquipo = !maxIntegrantes
    ? (minIntegrantes ? `${minIntegrantes}+` : '5')
    : minIntegrantes && minIntegrantes !== maxIntegrantes
      ? `${minIntegrantes}–${maxIntegrantes}`
      : String(maxIntegrantes);
  const bases = [baseTamanoEquipo(evento), ...rules.filter(Boolean)];

  // El premio lo escribe el administrador en cada desafío; se muestra el del
  // primero que lo tenga (en la práctica es el mismo para todos).
  const premio = challenges.find((c) => c.premio)?.premio || null;

  const tituloDesafios = totalDesafios === 1
    ? 'Un desafío'
    : `${NUMERALES[totalDesafios] || totalDesafios} desafíos`;

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
      <HackNav mostrarDesafios={totalDesafios > 0} />

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
              No son ejercicios de clase: los desafíos los ponen empresas, dependencias e
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
            <span className={styles.figureValue}>{totalDesafios}</span>
            <span className={styles.figureLabel}>{totalDesafios === 1 ? 'Desafío' : 'Desafíos'}</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureValue}>24 h</span>
            <span className={styles.figureLabel}>De desarrollo</span>
          </div>
          <div className={styles.figure}>
            <span className={styles.figureValue}>{integrantesPorEquipo}</span>
            <span className={styles.figureLabel}>Integrantes por equipo</span>
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
            {premio && (
              <div className={styles.figure}>
                <span className={styles.figureValue}>{premio}</span>
                <span className={styles.figureLabel}>Al primer lugar de cada desafío</span>
              </div>
            )}
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
          {bases.map((rule) => (
            <article className={styles.rule} key={rule.num}>
              <span className={styles.ruleNum}>{rule.num}</span>
              <h3 className={styles.ruleTitle}>{rule.title}</h3>
              <p className={styles.ruleText}>{rule.text}</p>
            </article>
          ))}
        </div>
      </ScrollSection>

      {/* 5 — Desafíos (los publica un administrador desde el panel). Sin
          ninguno activo la sección no se pinta: una baraja vacía rompería el
          pin del scroll y no diría nada. */}
      {totalDesafios > 0 && (
        <ChallengeStack challenges={challenges} evento={evento} titulo={tituloDesafios} />
      )}

      {/* 6 — Cronograma */}
      <ScheduleSection stops={scheduleStops} zIndex={6} />

      {/* 7 — Premio, registro y pie */}
      <ClosingSection zIndex={7} evento={evento} premio={premio} />
    </div>
  );
}
