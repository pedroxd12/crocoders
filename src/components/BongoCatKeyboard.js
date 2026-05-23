'use client';

import React, { useEffect, useRef, useState, Suspense } from 'react';
const Spline = React.lazy(() => import('@splinetool/react-spline'));

// Definir SKILLS localmente para la interacción
const SKILLS = {
  js: { label: "JavaScript", shortDescription: "JavaScript" },
  ts: { label: "TypeScript", shortDescription: "TypeScript" },
  html: { label: "HTML", shortDescription: "HTML" },
  css: { label: "CSS", shortDescription: "CSS" },
  react: { label: "React", shortDescription: "React" },
  vue: { label: "Vue", shortDescription: "Vue" },
  nextjs: { label: "Next.js", shortDescription: "Next.js" },
  tailwind: { label: "Tailwind", shortDescription: "Tailwind" },
  nodejs: { label: "Node.js", shortDescription: "Node.js" },
  express: { label: "Express", shortDescription: "Express" },
  postgres: { label: "PostgreSQL", shortDescription: "PostgreSQL" },
  mongodb: { label: "MongoDB", shortDescription: "MongoDB" },
  git: { label: "Git", shortDescription: "Git" },
  github: { label: "GitHub", shortDescription: "GitHub" },
  prettier: { label: "Prettier", shortDescription: "Prettier" },
  npm: { label: "NPM", shortDescription: "NPM" },
  firebase: { label: "Firebase", shortDescription: "Firebase" },
  wordpress: { label: "WordPress", shortDescription: "WordPress" },
  linux: { label: "Linux", shortDescription: "Linux" },
  docker: { label: "Docker", shortDescription: "Docker" },
  nginx: { label: "NginX", shortDescription: "NginX" },
  aws: { label: "AWS", shortDescription: "AWS" },
  vim: { label: "Vim", shortDescription: "Vim" },
  vercel: { label: "Vercel", shortDescription: "Vercel" },
};

const sceneUrl = "/teclado/skills-keyboard.splinecode";

export default function BongoCatKeyboard() {
  const [shouldLoad, setShouldLoad] = useState(false);
  const containerRef = useRef(null);
  const splineRef = useRef(null);
  const isVisibleRef = useRef(true);
  const cleanupRef = useRef({ resizeHandler: null, bongoInterval: null, visibilityObserver: null });

  const onLoad = (spline) => {
    splineRef.current = spline;

    const updateLayout = () => {
        const keyboard = spline.findObjectByName("keyboard");
        const isMobile = window.matchMedia("(max-width: 768px)").matches;

        if (keyboard) {
            if (isMobile) {
                 keyboard.scale.x = 0.07;
                 keyboard.scale.y = 0.07;
                 keyboard.scale.z = 0.07;
                 keyboard.position.x = 0;
                 keyboard.position.y = 15;
                 keyboard.position.z = 0;
            } else {
                 keyboard.scale.x = 0.18;
                 keyboard.scale.y = 0.18;
                 keyboard.scale.z = 0.18;
                 keyboard.position.x = 0;
                 keyboard.position.y = 20;
                 keyboard.position.z = 0;
            }

            keyboard.rotation.x = Math.PI;
            keyboard.rotation.y = Math.PI / 3;
            keyboard.rotation.z = Math.PI;
        }

        const allObjects = spline.getAllObjects();
        const desktopKeyCaps = allObjects.filter((obj) => obj.name === "keycap-desktop");
        const mobileKeyCaps = allObjects.filter((obj) => obj.name === "keycap-mobile");

        if (isMobile) {
            desktopKeyCaps.forEach(k => k.visible = false);
            mobileKeyCaps.forEach(k => k.visible = true);
        } else {
            desktopKeyCaps.forEach(k => k.visible = true);
            mobileKeyCaps.forEach(k => k.visible = false);
        }

        const keycaps = allObjects.filter((obj) => obj.name === "keycap");
        keycaps.forEach(k => k.visible = true);
    };

    updateLayout();

    // Debounced resize handler para no spammear updateLayout durante el resize
    let resizeTimeout = null;
    const debouncedResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateLayout, 150);
    };

    window.addEventListener('resize', debouncedResize, { passive: true });
    cleanupRef.current.resizeHandler = debouncedResize;

    spline.addEventListener("mouseHover", (e) => handleMouseHover(e, spline));
    spline.addEventListener("mouseDown", (e) => handleKeyPress(e, spline));

    try {
        spline.addEventListener("keyDown", (e) => handleKeyPress(e, spline));
    } catch (err) {
        // keyDown event not available in this scene
    }

    startBongoAnimation(spline);
  };

  const handleMouseHover = (e, spline) => {
    if (!spline) return;

    if (e.target.name === "body" || e.target.name === "platform") {
       if (spline.getVariable("heading") && spline.getVariable("desc")) {
            spline.setVariable("heading", "");
            spline.setVariable("desc", "");
       }
    } else {
       const skill = SKILLS[e.target.name];
       if (skill) {
           if (spline.getVariable("heading") !== undefined) {
               spline.setVariable("heading", skill.label);
               spline.setVariable("desc", skill.shortDescription);
           }
       }
    }
  };

  const handleKeyPress = (e, spline) => {
    if (!spline) return;

    const skill = SKILLS[e.target.name];
    if (!skill) return;

    try {
        if (spline.getVariable("heading") !== undefined) {
            spline.setVariable("heading", skill.label);
            spline.setVariable("desc", skill.shortDescription);
        }
    } catch (err) {
        // Spline scene without heading/desc variables
    }

    const keycap = e.target;
    if (keycap && keycap.position) {
        const originalY = keycap.position.y;
        keycap.position.y = originalY - 10;
        setTimeout(() => {
            if (keycap.position) {
                keycap.position.y = originalY;
            }
        }, 150);
    }
  };

  const startBongoAnimation = (spline) => {
    const framesParent = spline.findObjectByName("bongo-cat");
    const frame1 = spline.findObjectByName("frame-1");
    const frame2 = spline.findObjectByName("frame-2");

    if (!frame1 || !frame2 || !framesParent) {
      return;
    }

    framesParent.visible = true;

    let i = 0;
    // Reducimos la frecuencia de 100ms (10fps) a 200ms (5fps) — la animación
    // de gato bongo es lo suficientemente sutil a 5fps y consume mucho menos CPU.
    // Además, pausamos la animación cuando el componente no está visible.
    const interval = setInterval(() => {
        if (!isVisibleRef.current) return;
        if (i % 2) {
          frame1.visible = false;
          frame2.visible = true;
        } else {
          frame1.visible = true;
          frame2.visible = false;
        }
        i++;
    }, 200);

    cleanupRef.current.bongoInterval = interval;
  };

  useEffect(() => {
    const cleanup = cleanupRef.current;
    return () => {
      if (cleanup.bongoInterval) {
        clearInterval(cleanup.bongoInterval);
      }
      if (cleanup.resizeHandler) {
        window.removeEventListener('resize', cleanup.resizeHandler);
      }
      if (cleanup.visibilityObserver) {
        cleanup.visibilityObserver.disconnect();
      }
    };
  }, []);

  // Separamos dos acciones con costes muy distintos:
  //   1. PREFETCH del .splinecode (barato, sólo descarga bytes) — con margen
  //      amplio para que esté en caché cuando llegue el momento de montar.
  //   2. MONTAR el visor Spline (caro: parsea ~500KB de runtime y construye la
  //      escena 3D de forma síncrona, bloqueando el hilo ~1s). Esto sólo debe
  //      ocurrir cuando el teclado está a punto de entrar en pantalla.
  // Antes ambas cosas pasaban con rootMargin 800px, así que el visor se montaba
  // mientras el usuario aún recorría los marquees y congelaba el scroll.
  useEffect(() => {
    if (shouldLoad) return;
    const el = containerRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    // 1. Prefetch temprano (margen amplio).
    const prefetchObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          if (!document.querySelector('link[data-spline-preload]')) {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.as = 'fetch';
            link.href = sceneUrl;
            link.crossOrigin = 'anonymous';
            link.setAttribute('data-spline-preload', '');
            document.head.appendChild(link);
          }
          prefetchObserver.disconnect();
        }
      },
      { rootMargin: '600px' }
    );
    prefetchObserver.observe(el);

    // 2. Montaje tardío (margen pequeño): el congelamiento de init ocurre cuando
    // el usuario ya está mirando la sección, no en medio del scroll anterior.
    const mountObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          mountObserver.disconnect();
        }
      },
      { rootMargin: '150px' }
    );
    mountObserver.observe(el);

    return () => {
      prefetchObserver.disconnect();
      mountObserver.disconnect();
    };
  }, [shouldLoad]);

  // Pausar render/animaciones cuando el canvas no está en pantalla. Spline
  // sigue corriendo su loop interno aunque no se vea, así que ocultarlo
  // libera GPU/CPU en el resto de la página.
  useEffect(() => {
    if (!shouldLoad) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        isVisibleRef.current = entry.isIntersecting;
      },
      { rootMargin: '100px', threshold: 0 }
    );
    observer.observe(el);
    cleanupRef.current.visibilityObserver = observer;
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ pointerEvents: 'auto', minHeight: '300px', contain: 'layout paint' }}
    >
      {shouldLoad ? (
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center bg-gray-900/30 rounded-lg">
              <span className="text-gray-500 text-sm">Cargando experiencia 3D...</span>
            </div>
          }
        >
          <Spline
            scene={sceneUrl}
            onLoad={onLoad}
            className="w-full h-full"
            style={{ pointerEvents: 'auto' }}
          />
        </Suspense>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-900/30 rounded-lg">
          <span className="text-gray-500 text-sm">Experiencia 3D</span>
        </div>
      )}
    </div>
  );
}
