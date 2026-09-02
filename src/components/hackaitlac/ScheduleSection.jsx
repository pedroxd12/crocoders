'use client';

import { useEffect, useRef } from 'react';
import styles from './hackaitlac.module.css';
import { acquireScroll, releaseScroll, revealLines, prefersReducedMotion } from './scroll-engine';

/**
 * Cronograma.
 *
 * Es la tabla «Fechas importantes» de la convocatoria, no una versión
 * inventada: seis paradas con su fecha y hora exactas, agrupadas en las dos
 * fases del evento. En escritorio se lee como un raíl horizontal; por debajo
 * de 900px el mismo marcado se convierte en una línea vertical.
 */
export default function ScheduleSection({ stops, zIndex = 6 }) {
  const sectionRef = useRef(null);
  const headingRef = useRef(null);
  const progressRef = useRef(null);
  const stopsRef = useRef([]);

  useEffect(() => {
    let ctx;
    let cleanupHeading = () => {};
    let cancelled = false;

    acquireScroll().then((libs) => {
      if (cancelled) return;
      const { gsap, ScrollTrigger } = libs;
      const section = sectionRef.current;
      if (!section) return;

      cleanupHeading = revealLines(headingRef.current, libs, { trigger: section });

      if (prefersReducedMotion()) return;

      ctx = gsap.context(() => {
        const vertical = window.matchMedia('(max-width: 900px)').matches;
        const items = stopsRef.current.filter(Boolean);

        gsap.set(progressRef.current, {
          scaleX: vertical ? 1 : 0,
          scaleY: vertical ? 0 : 1,
        });

        gsap.to(progressRef.current, {
          scaleX: 1,
          scaleY: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top 72%',
            end: 'bottom 78%',
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });

        gsap.from(items, {
          opacity: 0,
          y: 26,
          duration: 0.7,
          ease: 'power3.out',
          stagger: 0.09,
          scrollTrigger: { trigger: section, start: 'top 68%', once: true },
        });
      }, section);
    });

    return () => {
      cancelled = true;
      cleanupHeading();
      if (ctx) ctx.revert();
      releaseScroll();
    };
  }, [stops]);

  return (
    <section
      id="cronograma"
      ref={sectionRef}
      className={styles.schedule}
      style={{ zIndex }}
      aria-label="Cronograma"
    >
      <div className={styles.scheduleInner}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionLabel}>Cronograma</span>
          <h2 className={styles.sectionHeading} ref={headingRef}>
            Del registro a la premiación: seis fechas que no se te pueden pasar.
          </h2>
        </div>

        <div className={styles.phases} aria-hidden="true">
          <span className={`${styles.phase} ${styles.phaseRegistro}`}>
            <span className={styles.phaseDot} />
            Registro · Septiembre
          </span>
          <span className={`${styles.phase} ${styles.phaseEvento}`}>
            <span className={styles.phaseDot} />
            Evento · 24 horas continuas · 8 y 9 de octubre
          </span>
        </div>

        <div className={styles.railWrap}>
          <span className={styles.railLine} aria-hidden="true">
            <span className={styles.railProgress} ref={progressRef} />
          </span>

          <ol className={styles.rail}>
            {stops.map((stop, i) => (
              <li
                key={stop.title}
                ref={(el) => {
                  stopsRef.current[i] = el;
                }}
                className={`${styles.stop} ${stop.key ? styles.stopKey : ''}`}
              >
                <span className={styles.stopNode} aria-hidden="true" />
                <div className={styles.stopBody}>
                  <p className={styles.stopDate}>
                    {stop.day}
                    <small>{stop.month}</small>
                  </p>
                  <span className={styles.stopTime}>{stop.time}</span>
                  <h3 className={styles.stopTitle}>{stop.title}</h3>
                  {stop.note && <p className={styles.stopNote}>{stop.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
