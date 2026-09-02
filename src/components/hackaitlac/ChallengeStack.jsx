'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './hackaitlac.module.css';
import ChallengeArt from './ChallengeArt';
import ChallengeModal from './ChallengeModal';
import {
  acquireScroll,
  releaseScroll,
  scrollToY,
  prefersReducedMotion,
} from './scroll-engine';

const PEEK = 42;
const SCALE_STEP = 0.045;
/* Por debajo de este ancho el pin + scrub es más molesto que útil: se cambia
   por una lista normal de tarjetas, que además se puede tocar directamente. */
const PIN_MIN_WIDTH = 861;

function stackPose(index) {
  return { y: index * PEEK, scale: 1 - index * SCALE_STEP };
}

export default function ChallengeStack({ challenges }) {
  const sectionRef = useRef(null);
  const deckRef = useRef(null);
  const cardsRef = useRef([]);
  const seekRef = useRef(null);

  const [selected, setSelected] = useState(null);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    let ctx;
    let cancelled = false;
    let mql;
    let onChange;

    acquireScroll().then(({ gsap, ScrollTrigger }) => {
      if (cancelled) return;

      const canPin = () =>
        !prefersReducedMotion() && window.matchMedia(`(min-width: ${PIN_MIN_WIDTH}px)`).matches;

      const build = () => {
        const cards = cardsRef.current.filter(Boolean);
        if (!cards.length) return;

        // Sin pin: la hoja de estilos ya deja la baraja como lista normal.
        if (!canPin()) {
          setPinned(false);
          seekRef.current = null;
          return;
        }

        setPinned(true);

        ctx = gsap.context(() => {
          gsap.set(cards, {
            zIndex: (i) => cards.length - i,
            transformOrigin: '50% 0%',
          });

          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top top',
              end: () => `+=${cards.length * window.innerHeight}`,
              pin: true,
              pinType: 'fixed',
              anticipatePin: 1,
              scrub: true,
              invalidateOnRefresh: true,
            },
          });

          // Fase 1 — las tarjetas suben desde abajo y se apilan.
          // `fromTo` con valores en función: al refrescar (resize, cambio de
          // orientación) se recalculan en vez de quedarse con los píxeles del
          // primer render, que era una de las causas de los saltos.
          cards.forEach((card, i) => {
            tl.fromTo(
              card,
              {
                y: () => window.innerHeight * 0.72 + i * PEEK,
                scale: stackPose(i).scale * 0.9,
                rotate: 0,
              },
              { ...stackPose(i), ease: 'power3.out', duration: 1.35 },
              i * 0.06,
            );
          });

          tl.to({}, { duration: 0.35 });

          // Fase 2 — cada tarjeta sale por arriba y la siguiente ocupa su sitio.
          const flyAt = tl.duration();
          const flying = cards.slice(0, -1);

          flying.forEach((card, i) => {
            const time = flyAt + i;
            const behind = cards.slice(i + 1);

            tl.to(
              card,
              {
                y: () => -window.innerHeight * 1.15,
                rotate: -25,
                scale: 0.94,
                ease: 'none',
                duration: 1,
              },
              time,
            );

            tl.to(
              behind,
              {
                y: (index) => stackPose(index).y,
                scale: (index) => stackPose(index).scale,
                ease: 'none',
                duration: 1,
              },
              time,
            );
          });

          tl.to({}, { duration: 0.4 });

          const total = tl.duration();
          const st = tl.scrollTrigger;

          // La tarjeta `k` está al frente justo en el instante `flyAt + k`.
          // Con esa equivalencia se sabe cuál marcar en los puntos de
          // navegación y a qué scroll saltar cuando se pulsa uno.
          const progressFor = (k) => (flyAt + k) / total;

          seekRef.current = (k) => {
            if (!st) return;
            scrollToY(st.start + progressFor(k) * (st.end - st.start));
          };

          // El scrub dispara onUpdate en cada frame; sólo avisamos a React
          // cuando cambia de tarjeta, no en cada píxel de scroll.
          let lastIndex = -1;
          tl.eventCallback('onUpdate', () => {
            const t = tl.progress() * total;
            const idx = Math.min(cards.length - 1, Math.max(0, Math.round(t - flyAt)));
            if (idx !== lastIndex) {
              lastIndex = idx;
              setActive(idx);
            }
          });
        }, sectionRef);
      };

      build();

      mql = window.matchMedia(`(min-width: ${PIN_MIN_WIDTH}px)`);
      onChange = () => {
        if (ctx) {
          ctx.revert();
          ctx = null;
        }
        build();
        ScrollTrigger.refresh();
      };
      mql.addEventListener('change', onChange);
    });

    return () => {
      cancelled = true;
      if (mql && onChange) mql.removeEventListener('change', onChange);
      if (ctx) ctx.revert();
      seekRef.current = null;
      releaseScroll();
    };
  }, [challenges]);

  const goTo = useCallback((index) => {
    setActive(index);
    if (seekRef.current) seekRef.current(index);
  }, []);

  return (
    <>
      <section
        id="desafios"
        ref={sectionRef}
        className={styles.challenges}
        style={{ zIndex: 5 }}
        aria-label="Desafíos"
      >
        <div className={styles.challengesHead}>
          <h2 className={styles.challengesTitle}>
            Cinco desafíos <em>reales</em>
          </h2>
          <p className={styles.challengesHint}>
            {pinned ? 'Desplázate para recorrerlos · toca una tarjeta para ver el detalle' : 'Toca una tarjeta para ver el detalle'}
          </p>

          {pinned && (
            <div className={styles.deckNav} role="group" aria-label="Ir a un desafío">
              {challenges.map((ch, i) => (
                <button
                  key={ch.id}
                  type="button"
                  aria-current={active === i ? 'true' : undefined}
                  aria-label={`Ir al desafío ${ch.index}: ${ch.title}`}
                  className={`${styles.deckDot} ${active === i ? styles.deckDotActive : ''}`}
                  onClick={() => goTo(i)}
                />
              ))}
            </div>
          )}
        </div>

        <div className={styles.stackStage}>
          <div className={styles.stackDeck} ref={deckRef}>
            {challenges.map((ch, i) => (
              <article
                key={ch.id}
                ref={(el) => {
                  cardsRef.current[i] = el;
                }}
                className={`${styles.card} ${styles[`cardTone${ch.tone}`]}`}
                role="button"
                tabIndex={0}
                aria-label={`Ver detalles del desafío ${ch.index}: ${ch.title}`}
                onClick={() => setSelected(ch)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(ch);
                  }
                }}
              >
                <div className={styles.cardContent}>
                  <div className={styles.cardTop}>
                    <h3 className={styles.cardTitle}>{ch.title}</h3>
                    <span className={styles.cardIndex}>{ch.index}</span>
                  </div>

                  <p className={styles.cardLede}>{ch.lede}</p>
                  <p className={styles.cardBody}>{ch.resumen}</p>

                  <div className={styles.cardTags}>
                    {ch.tags.map((tag) => (
                      <span className={styles.cardTag} key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  <span className={styles.cardCta}>
                    <span>Ver detalles</span>
                    <span className={styles.cardCtaArrow} aria-hidden="true">
                      →
                    </span>
                  </span>
                </div>

                <div className={styles.cardMedia}>
                  <div className={styles.cardArt}>
                    <ChallengeArt id={ch.id} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ChallengeModal challenge={selected} onClose={() => setSelected(null)} />
    </>
  );
}
