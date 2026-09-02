'use client';

/**
 * Motor de scroll compartido de HackaItlac.
 *
 * Antes cada componente hacía su propio `await import('gsap')` y creaba sus
 * ScrollTriggers, mientras Lenis se instanciaba en el efecto del componente
 * padre. Como React ejecuta los efectos de los hijos ANTES que los del padre,
 * los triggers (incluido el `pin` de los desafíos) se medían contra un scroll
 * que todavía no estaba conectado a Lenis: de ahí los saltos y el pin que se
 * quedaba pegado.
 *
 * Aquí las librerías y Lenis se inicializan UNA sola vez, dentro de la misma
 * promesa que todos los componentes esperan. Nadie registra un trigger hasta
 * que el scroll suave está enganchado. El contador de referencias permite
 * destruir Lenis al salir de la página (y sobrevive al doble montaje de
 * StrictMode en desarrollo).
 */

let libsPromise = null;
let libs = null;
let lenis = null;
let tickerFn = null;
let refs = 0;

async function loadLibs() {
  const [gsapMod, stMod, lenisMod, splitMod] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
    import('lenis'),
    import('split-type'),
  ]);

  const gsap = gsapMod.gsap || gsapMod.default;
  const ScrollTrigger = stMod.ScrollTrigger || stMod.default;
  const Lenis = lenisMod.default || lenisMod.Lenis;
  const SplitType = splitMod.default || splitMod.SplitType;

  gsap.registerPlugin(ScrollTrigger);
  return { gsap, ScrollTrigger, Lenis, SplitType };
}

function startLenis() {
  if (lenis || !libs) return;
  const { gsap, ScrollTrigger, Lenis } = libs;

  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    // El scroll táctil nativo es más fiable que el suavizado en móvil y evita
    // que el pin del stack de desafíos se desincronice del dedo.
    syncTouch: false,
  });

  lenis.on('scroll', ScrollTrigger.update);
  tickerFn = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(tickerFn);
  gsap.ticker.lagSmoothing(0);
}

function stopLenis() {
  if (!libs) return;
  const { gsap } = libs;
  if (tickerFn) {
    gsap.ticker.remove(tickerFn);
    tickerFn = null;
  }
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }
}

/** ¿El usuario pidió menos movimiento? */
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Reserva el motor de scroll. El contador sube de forma síncrona para que un
 * `release()` que llegue antes de que resuelva la promesa no deje Lenis vivo.
 * Devuelve `{ gsap, ScrollTrigger, SplitType }`.
 */
export function acquireScroll() {
  refs += 1;
  if (!libsPromise) {
    libsPromise = loadLibs().then((loaded) => {
      libs = loaded;
      return loaded;
    });
  }
  return libsPromise.then((loaded) => {
    if (refs > 0) startLenis();
    return loaded;
  });
}

export function releaseScroll() {
  refs -= 1;
  if (refs <= 0) {
    refs = 0;
    stopLenis();
  }
}

/** Recalcula todos los triggers. Útil tras cargar fuentes o imágenes. */
export function refreshScroll() {
  if (libs) libs.ScrollTrigger.refresh();
}

/** Desplaza suavemente hasta un elemento respetando el offset del nav. */
export function scrollToId(id, offset = -72) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) {
    lenis.scrollTo(el, { offset, duration: 1.2 });
  } else {
    const top = el.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }
}

/** Desplaza suavemente hasta una posición absoluta en píxeles. */
export function scrollToY(y, duration = 1) {
  if (lenis) lenis.scrollTo(y, { duration });
  else window.scrollTo({ top: y, behavior: 'smooth' });
}

/**
 * Congela el scroll suave mientras hay un overlay abierto. `overflow: hidden`
 * en el body no basta: Lenis escucha la rueda directamente y seguiría
 * desplazando la página por detrás del modal.
 */
export function pauseScroll() {
  if (lenis) lenis.stop();
}

export function resumeScroll() {
  if (lenis) lenis.start();
}

/**
 * Parte un bloque de texto en líneas enmascaradas y las revela al entrar.
 * Devuelve una función de limpieza que deshace el split.
 *
 * `SplitType.revert()` restaura el innerHTML original, así que los envoltorios
 * de máscara que insertamos aquí desaparecen con él.
 */
export function revealLines(el, { gsap, ScrollTrigger, SplitType }, options = {}) {
  if (!el) return () => {};

  const { trigger = el, start = 'top 85%', duration = 1.2, stagger = 0.08, delay = 0 } = options;

  if (prefersReducedMotion()) {
    gsap.set(el, { visibility: 'visible' });
    return () => {};
  }

  const split = new SplitType(el, { types: 'lines' });
  const lines = split.lines || [];

  lines.forEach((line) => {
    const mask = document.createElement('span');
    mask.style.display = 'block';
    mask.style.overflow = 'hidden';
    line.parentNode.insertBefore(mask, line);
    mask.appendChild(line);
  });

  gsap.set(lines, { yPercent: 105 });
  gsap.set(el, { visibility: 'visible' });

  const st = ScrollTrigger.create({
    trigger,
    start,
    once: true,
    onEnter: () => {
      gsap.to(lines, { yPercent: 0, duration, ease: 'power4.out', stagger, delay });
    },
  });

  return () => {
    st.kill();
    split.revert();
  };
}
