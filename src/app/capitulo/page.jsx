'use client';

import React, { useEffect, useRef } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import SplitType from 'split-type';
import Lenis from 'lenis';
import styles from './page.module.css';
import BongoCatKeyboard from '@/components/BongoCatKeyboard';
import AnimatedSection from '@/components/AnimatedSection';

// Register ScrollTrigger
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export default function AnimationPage() {
  const containerRef = useRef(null);

  useEffect(() => {
    // Lenis Setup
    const lenis = new Lenis();

    // Integate Lenis with ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update);
    
    // Use GSAP's ticker to drive Lenis for perfect sync
    const tickerFunction = (time) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(tickerFunction);
    gsap.ticker.lagSmoothing(0);

    let splitInstance;

    const ctx = gsap.context(() => {
      // Split Text
      const textElements = document.querySelectorAll(`.${styles.item} h1`);
      
      // Store instance for cleanup
      // Check if already split to prevent duplication in Strict Mode causing issues even with cleanup
      splitInstance = new SplitType(textElements, { types: 'chars', charClass: 'char' });

      function animateChars(chars, reverse = false) {
        const staggerOptions = {
          each: 0.35,
          from: reverse ? 'start' : 'end',
          ease: 'linear',
        };

        // Antes animábamos `fontWeight` de cada carácter con scrub: eso fuerza
        // re-layout del texto en CADA frame de scroll (las métricas de la fuente
        // cambian), provocando tareas largas de 300ms+ y scroll trabado.
        // Animamos `opacity` en su lugar — es compositado por el GPU, no toca el
        // layout, y da un efecto de "revelado" equivalente y fluido.
        gsap.fromTo(
          chars,
          { opacity: 0.25 },
          {
            opacity: 1,
            duration: 1,
            ease: 'none',
            stagger: staggerOptions,
            scrollTrigger: {
              trigger: chars[0].closest(`.${styles.marqueeContainer}`),
              start: '50% bottom',
              end: 'top top',
              scrub: true,
            },
          }
        );
      }

      const containers = document.querySelectorAll(`.${styles.marqueeContainer}`);

      containers.forEach((container, index) => {
        let start = '0%';
        let end = '-15%';

        if (index % 2 === 0) {
          start = '0%';
          end = '10%';
        }

        const marquee = container.querySelector(`.${styles.marquee}`);
        const words = marquee.querySelectorAll(`.${styles.item} h1`);

        gsap.fromTo(
          marquee,
          {
            x: start,
          },
          {
            x: end,
            scrollTrigger: {
              trigger: container,
              start: 'top bottom',
              end: '150% top',
              scrub: true,
            },
          }
        );

        words.forEach((word) => {
          const chars = Array.from(word.querySelectorAll('.char'));
          if (chars.length) {
            const reverse = index % 2 !== 0;
            animateChars(chars, reverse);
          }
        });
      });

    }, containerRef);

    return () => {
      ctx.revert(); // Cleanup GSAP
      if (splitInstance) splitInstance.revert(); // Cleanup SplitType
      gsap.ticker.remove(tickerFunction); // Stop syncing lenis
      lenis.destroy();
    };
  }, []);

  return (
    <div className={styles.pageWrapper} ref={containerRef}>
      <div className={styles.container}>
        <section className={styles.hero}>
          <h1 className={styles.heroText}>Computer Society</h1>
          <div className={styles.logosWrapper}>
            <div className={styles.logoContainer}>
              <Image 
                  src="/capitulo/logo.png" 
                  alt="Logo Capitulo" 
                  fill
                  style={{ objectFit: 'contain' }}
                  priority
                  sizes="(max-width: 500px) 80vw, 50vw"
              />
            </div>
            <div className={`${styles.logoContainer} ${styles.itlacLogo}`}>
              <Image 
                  src="/img/logo_itlac.png" 
                  alt="Logo ITLAC" 
                  fill
                  style={{ objectFit: 'contain' }}
                  priority
                  sizes="(max-width: 500px) 80vw, 50vw"
              />
            </div>
          </div>
        </section>

        <section className={styles.about}>
          <p className={styles.p}>
            Nuestro objetivo es fomentar el desarrollo profesional y personal de nuestros miembros a través de actividades,
            talleres y eventos que promuevan el aprendizaje continuo y la colaboración entre estudiantes de diversas disciplinas.

          </p>
        </section>

        <section className={styles.marquees}>
            {/* Marquee 1 */}
          <div className={`${styles.marqueeContainer}`} id="marquee-1">
            <div className={`${styles.marquee} ${styles.offsetOdd}`}>
              <div className={styles.item}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/capitulo/img1.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
              <div className={`${styles.item} ${styles.itemWithText}`}>
                <h1>Innovación</h1>
              </div>
              <div className={styles.item}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/capitulo/img2.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
              <div className={styles.item}>
                 <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/capitulo/img3.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
              <div className={styles.item}>
                 <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/capitulo/img4.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
            </div>
          </div>

           {/* Marquee 2 */}
          <div className={styles.marqueeContainer} id="marquee-2">
            <div className={`${styles.marquee} ${styles.offsetEven}`}>
              <div className={styles.item}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/capitulo/img5.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
              <div className={styles.item}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/capitulo/img6.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
              <div className={styles.item}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/capitulo/img7.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
              <div className={`${styles.item} ${styles.itemWithText}`}>
                <h1>Comunidad</h1>
              </div>
              <div className={styles.item}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/capitulo/img8.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
            </div>
          </div>

           {/* Marquee 3 */}
          <div className={styles.marqueeContainer} id="marquee-3">
            <div className={`${styles.marquee} ${styles.offsetOdd}`}>
              <div className={styles.item}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/capitulo/img9.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
              <div className={`${styles.item} ${styles.itemWithText}`}>
                <h1>Formación</h1>
              </div>
              <div className={styles.item}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image src="/capitulo/img10.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
              <div className={styles.item}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                     <Image src="/capitulo/img11.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
              <div className={styles.item}>
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                     <Image src="/capitulo/img12.jpeg" alt="" fill style={{objectFit: 'cover'}} sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.participaSection}>
          <AnimatedSection className="w-full max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12">
              <div className="flex-1 text-center md:text-left w-full max-w-md px-4">
                <h1 className={`${styles.noOffset} text-2xl md:text-6xl font-bold leading-tight break-words`}>Qué esperas,</h1>
                <h1 className={`${styles.noOffset} text-2xl md:text-6xl font-bold leading-tight break-words`}>inicia ahora.</h1>
                <p className={`${styles.heroDescription} text-sm md:text-xl mt-4 break-words`}>Unéte a nuestra comunidad y crece con nosotros.</p>
              </div>
              <div className="flex-1 w-full h-[400px] md:h-[500px] max-w-lg">
                <BongoCatKeyboard />
              </div>
            </div>
          </AnimatedSection>
        </section>
      </div>
    </div>
  );
}
