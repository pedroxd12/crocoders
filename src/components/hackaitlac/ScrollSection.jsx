'use client';

import { useEffect, useRef } from 'react';
import styles from './hackaitlac.module.css';
import { acquireScroll, releaseScroll, revealLines, prefersReducedMotion } from './scroll-engine';

/**
 * Sección con el revelado en diagonal de `index.html`: al entrar en pantalla,
 * el panel de color sube 220px y se inclina 8°, tapando el final de la sección
 * anterior. El encabezado se parte en líneas y sube dentro de su máscara.
 *
 * El apilado ya no depende de `:nth-child` (se rompía en cuanto se añadía
 * cualquier elemento suelto dentro de la página): cada sección recibe su
 * `z-index` explícito desde el orquestador.
 */
export default function ScrollSection({
  id,
  theme = 'themePaper',
  zIndex = 1,
  label,
  heading,
  children,
}) {
  const sectionRef = useRef(null);
  const bgRef = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => {
    let ctx;
    let cleanupHeading = () => {};
    let cancelled = false;

    acquireScroll().then((libs) => {
      if (cancelled) return;
      const { gsap } = libs;
      const section = sectionRef.current;
      const bg = bgRef.current;
      if (!section || !bg) return;

      ctx = gsap.context(() => {
        if (!prefersReducedMotion()) {
          gsap.to(bg, {
            y: -220,
            skewY: -8,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top 95%',
              end: 'top 40%',
              scrub: 0.5,
              invalidateOnRefresh: true,
            },
          });
        }

        cleanupHeading = revealLines(headingRef.current, libs, { trigger: section });
      }, section);
    });

    return () => {
      cancelled = true;
      cleanupHeading();
      if (ctx) ctx.revert();
      releaseScroll();
    };
  }, []);

  return (
    <section
      id={id}
      ref={sectionRef}
      className={`${styles.section} ${styles[theme] || ''}`}
      style={{ zIndex }}
    >
      <div className={styles.skewBg} aria-hidden="true">
        <div className={styles.bgFill} ref={bgRef} />
      </div>

      <div className={styles.container}>
        {(label || heading) && (
          <div className={styles.sectionHead}>
            {label && <span className={styles.sectionLabel}>{label}</span>}
            {heading && (
              <h2 className={styles.sectionHeading} ref={headingRef}>
                {heading}
              </h2>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
