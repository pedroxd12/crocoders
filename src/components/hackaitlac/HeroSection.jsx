'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import styles from './hackaitlac.module.css';
import { acquireScroll, releaseScroll, refreshScroll, prefersReducedMotion, scrollToId } from './scroll-engine';

/**
 * Hero.
 *
 * El wordmark es el archivo original del manual de marca (extraído del PDF),
 * no una reconstrucción tipográfica: conserva la oblicua y el arco de las
 * letras que antes no coincidían con el logotipo.
 */
export default function HeroSection() {
  const emblemRef = useRef(null);
  const kickerRef = useRef(null);
  const markRef = useRef(null);
  const editionRef = useRef(null);
  const metaRef = useRef(null);
  const placeRef = useRef(null);
  const actionsRef = useRef(null);

  useEffect(() => {
    let ctx;
    let split;
    let cancelled = false;

    acquireScroll().then(({ gsap, SplitType }) => {
      if (cancelled) return;

      const reveal = [editionRef.current, metaRef.current, placeRef.current, actionsRef.current];

      if (prefersReducedMotion()) {
        gsap.set([emblemRef.current, ...reveal], { opacity: 1 });
        gsap.set(kickerRef.current, { visibility: 'visible' });
        return;
      }

      ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        tl.fromTo(
          emblemRef.current,
          { opacity: 0, y: 18, scale: 0.92 },
          { opacity: 1, y: 0, scale: 1, duration: 0.9 },
        );

        if (kickerRef.current) {
          split = new SplitType(kickerRef.current, { types: 'chars' });
          gsap.set(kickerRef.current, { visibility: 'visible' });
          tl.from(
            split.chars || [],
            { yPercent: 120, opacity: 0, duration: 0.7, stagger: 0.022 },
            '-=0.55',
          );
        }

        // El wordmark sube desde detrás del borde de su máscara.
        tl.from(
          markRef.current?.querySelector('img'),
          { yPercent: 108, duration: 1.25, ease: 'power4.out' },
          '-=0.45',
        );

        tl.fromTo(
          reveal,
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.85, stagger: 0.12 },
          '-=0.75',
        );
      });
    });

    return () => {
      cancelled = true;
      if (split) split.revert();
      if (ctx) ctx.revert();
      releaseScroll();
    };
  }, []);

  return (
    <section className={styles.hero} id="inicio">
      <div className={styles.heroGrid} aria-hidden="true" />
      <div className={styles.heroGlow} aria-hidden="true" />

      <div className={styles.heroInner}>
        <Image
          ref={emblemRef}
          className={styles.heroEmblem}
          src="/hackaitlac/emblem.png"
          alt=""
          width={612}
          height={633}
          priority
          onLoad={refreshScroll}
        />

        <p className={styles.heroKicker} ref={kickerRef}>
          Hackatón
        </p>

        <h1 className={styles.heroMark} ref={markRef}>
          <span className={styles.srOnly}>HackaItlac 2026 — Segunda edición</span>
          <Image
            src="/hackaitlac/wordmark.png"
            alt=""
            aria-hidden="true"
            width={612}
            height={124}
            priority
            sizes="(max-width: 760px) 92vw, 720px"
            onLoad={refreshScroll}
          />
        </h1>

        <p className={styles.heroEdition} ref={editionRef}>
          <span className={styles.editionRule} aria-hidden="true" />
          Segunda Edición
          <span className={styles.editionRule} aria-hidden="true" />
        </p>

        <div className={styles.heroMeta} ref={metaRef}>
          <div className={styles.heroMetaItem}>
            <span className={styles.heroMetaValue}>
              8<em>—</em>9
            </span>
            <span className={styles.heroMetaLabel}>Octubre 2026</span>
          </div>
          <div className={styles.heroMetaItem}>
            <span className={styles.heroMetaValue}>24 h</span>
            <span className={styles.heroMetaLabel}>Sin parar</span>
          </div>
          <div className={styles.heroMetaItem}>
            <span className={styles.heroMetaValue}>5</span>
            <span className={styles.heroMetaLabel}>Desafíos reales</span>
          </div>
          <div className={styles.heroMetaItem}>
            <span className={styles.heroMetaValue}>$15<em>k</em></span>
            <span className={styles.heroMetaLabel}>MXN por desafío</span>
          </div>
        </div>

        <p className={styles.heroPlace} ref={placeRef}>
          Gimnasio Auditorio del Instituto Tecnológico de Lázaro Cárdenas
        </p>

        <div className={styles.heroActions} ref={actionsRef}>
          <a className={styles.btnPrimary} href="#registro" onClick={(e) => { e.preventDefault(); scrollToId('registro'); }}>
            Registrar equipo
            <span className={styles.btnArrow} aria-hidden="true">→</span>
          </a>
          <a className={styles.btnGhost} href="#desafios" onClick={(e) => { e.preventDefault(); scrollToId('desafios'); }}>
            Ver los 5 desafíos
          </a>
        </div>
      </div>

      <div className={styles.scrollCue} aria-hidden="true">
        <span className={styles.scrollCueLabel}>Scroll</span>
        <span className={styles.scrollCueTrack} />
      </div>
    </section>
  );
}
