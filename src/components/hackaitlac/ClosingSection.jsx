'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './hackaitlac.module.css';
import { acquireScroll, releaseScroll, revealLines } from './scroll-engine';

const CONTACTO = 'hackaitlac@lcardenas.tecnm.mx';

/** Cierre: premio, llamada al registro y pie con las instituciones. */
export default function ClosingSection({ zIndex = 7 }) {
  const sectionRef = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;

    acquireScroll().then((libs) => {
      if (cancelled) return;
      cleanup = revealLines(titleRef.current, libs, { trigger: sectionRef.current, start: 'top 78%' });
    });

    return () => {
      cancelled = true;
      cleanup();
      releaseScroll();
    };
  }, []);

  return (
    <section
      id="registro"
      ref={sectionRef}
      className={styles.closing}
      style={{ zIndex }}
      aria-label="Premio y registro"
    >
      <div className={styles.closingGlow} aria-hidden="true" />

      <div className={styles.closingInner}>
        <div className={styles.prize}>
          <p className={styles.prizeAmount}>
            $15,000
            <small>MXN al primer lugar de cada desafío</small>
          </p>
          <p className={styles.prizeCopy}>
            Además del premio económico, el equipo ganador de cada desafío recibe un reconocimiento
            oficial. Todos los participantes obtienen constancia digital descargable, y los
            proyectos pueden vincularse con la empresa o institución que patrocina el desafío.
          </p>
        </div>

        <div className={styles.ctaBlock}>
          <h2 className={styles.ctaTitle} ref={titleRef}>
            Reúne a tu equipo y <em>elige tu desafío</em>
          </h2>
          <p className={styles.ctaCopy}>
            El registro está abierto del 1 al 30 de septiembre de 2026, o hasta agotar los espacios
            disponibles. Cinco integrantes más un asesor, un solo desafío por equipo.
          </p>
          <div className={styles.ctaActions}>
            <a
              className={styles.btnGold}
              href={`mailto:${CONTACTO}?subject=${encodeURIComponent('Registro HackaItlac 2026')}`}
            >
              Registrar mi equipo
              <span className={styles.btnArrow} aria-hidden="true">
                →
              </span>
            </a>
            <a className={styles.btnOutline} href={`mailto:${CONTACTO}`}>
              Escribir al comité
            </a>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerOrgs}>
          <span className={styles.orgChip}>
            <Image
              src="/hackaitlac/org-tecnm.png"
              alt="Tecnológico Nacional de México"
              width={288}
              height={127}
              sizes="150px"
            />
          </span>
          <span className={styles.orgChip}>
            <Image
              src="/hackaitlac/org-itlac.png"
              alt="Instituto Tecnológico de Lázaro Cárdenas"
              width={413}
              height={256}
              sizes="80px"
            />
          </span>
        </div>
        <div className={styles.footerMeta}>
          <span>
            Organiza: Academia de Ingeniería en Sistemas Computacionales · Capítulo estudiantil IEEE
            Computer Society
          </span>
          <span>
            Informes: <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>
          </span>
          <span>
            <Link href="/">← Volver a Crocoders</Link>
          </span>
        </div>
      </footer>
    </section>
  );
}
