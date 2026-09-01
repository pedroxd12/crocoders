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

// GEOMETRÍA CANÓNICA DEL VISOR.
// La escena de Spline tiene cámara fija: el canvas siempre muestra el mismo
// campo de visión vertical, así que el tamaño y el encuadre del gato dependen
// por completo de la caja que lo contiene. Antes cada página le daba una caja
// distinta (400/500px con max-w-lg en /capitulo, 350/600px a todo lo ancho en
// la home, 600px fijos en /contacto) y por eso el gato se veía más grande, más
// chico o descentrado según la sección.
// Ahora la caja vive DENTRO del componente y es la de /capitulo, que es la
// referencia buena; las páginas sólo aportan el hueco donde va.
const STAGE_CLASS = 'relative w-full max-w-lg mx-auto h-[400px] md:h-[500px]';

// Milisegundos entre frames del gato bongo. 200ms (5fps) basta para el efecto
// y cuesta mucha menos CPU que los 100ms originales.
const BONGO_FRAME_MS = 200;

// Precalienta los dos recursos caros del visor 3D:
//   - el chunk JS del runtime de Spline (~2MB): es lo que dominaba la espera —
//     antes empezaba a descargarse recién cuando la sección estaba a 150px,
//     así que el gato aparecía 2-3s después de que el usuario ya estaba mirando.
//   - el archivo .splinecode de la escena (~230KB).
// Se llama en idle tras cargar la página y también desde el observer de
// prefetch; el flag evita trabajo duplicado entre instancias/páginas.
let splineWarmupStarted = false;
function warmupSplineAssets() {
  if (splineWarmupStarted || typeof window === 'undefined') return;
  splineWarmupStarted = true;

  import('@splinetool/react-spline').catch(() => {
    // Si falla (p. ej. red caída), permitir reintentar en el próximo trigger.
    splineWarmupStarted = false;
  });

  if (!document.querySelector('link[data-spline-preload]')) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'fetch';
    link.href = sceneUrl;
    link.crossOrigin = 'anonymous';
    link.setAttribute('data-spline-preload', '');
    document.head.appendChild(link);
  }
}

export default function BongoCatKeyboard() {
  const [shouldLoad, setShouldLoad] = useState(false);
  const containerRef = useRef(null);
  const splineRef = useRef(null);
  const isVisibleRef = useRef(true);
  const rectSyncFrameRef = useRef(0);
  const cleanupRef = useRef({
    resizeHandler: null,
    bongoInterval: null,
    visibilityObserver: null,
    scrollRectHandler: null,
    pointerRectHandler: null,
  });

  // ---------------------------------------------------------------------
  // Sincronización del área interactiva (hit-test) con el canvas visible.
  //
  // El runtime de Spline no calcula el raycast contra la posición real del
  // canvas: usa un rect CACHEADO (eventManager.eventContext.domRect) que sólo
  // refresca en dos situaciones — su propio ResizeObserver y un listener de
  // `scroll` sobre `document` en fase de burbuja. En cuanto el canvas se mueve
  // por cualquier otro motivo, el área que responde al mouse se queda atrás y
  // hay que apuntar lejos del teclado que se ve. Pasa en toda la página:
  //   - En el inicio el scroll ocurre dentro de .pageWrapper (el body está en
  //     overflow:hidden), y los eventos `scroll` de un elemento NO burbujean,
  //     así que ese listener de `document` nunca se ejecuta: el hit-test queda
  //     congelado donde estaba el teclado al cargar la escena — 300px por
  //     debajo del viewport, por el rootMargin del observer de montaje.
  //   - En /capitulo y /contacto el bloque entra con una animación de
  //     framer-motion (20-30px de desplazamiento) que ocurre después de que el
  //     rect ya quedó cacheado.
  // Lo refrescamos nosotros en fase de CAPTURA, así el rect ya está corregido
  // cuando el listener del propio canvas procesa ese mismo evento.
  const syncPointerRect = () => {
    const spline = splineRef.current;
    const context = spline?.eventManager?.eventContext;
    const canvas = spline?.canvas;
    if (!context || !canvas) return;
    context.domRect = canvas.getBoundingClientRect();
  };

  // Durante el scroll basta con un refresco por frame.
  const scheduleRectSync = () => {
    if (rectSyncFrameRef.current) return;
    rectSyncFrameRef.current = requestAnimationFrame(() => {
      rectSyncFrameRef.current = 0;
      syncPointerRect();
    });
  };

  // Suelta lo que crea onLoad. Se llama al desmontar y también al principio de
  // onLoad: Spline puede reemitir `load` (StrictMode en dev, remount al navegar
  // entre páginas) y sin esto quedaban intervalos y listeners de resize
  // duplicados corriendo — el gato terminaba animándose al doble de velocidad
  // en unas páginas y no en otras.
  const disposeSceneBindings = () => {
    const cleanup = cleanupRef.current;
    if (cleanup.bongoInterval) {
      clearInterval(cleanup.bongoInterval);
      cleanup.bongoInterval = null;
    }
    if (cleanup.resizeHandler) {
      window.removeEventListener('resize', cleanup.resizeHandler);
      cleanup.resizeHandler = null;
    }
    if (cleanup.scrollRectHandler) {
      window.removeEventListener('scroll', cleanup.scrollRectHandler, true);
      cleanup.scrollRectHandler = null;
    }
    if (cleanup.pointerRectHandler) {
      const stage = containerRef.current;
      if (stage) {
        stage.removeEventListener('pointerenter', cleanup.pointerRectHandler, true);
        stage.removeEventListener('pointermove', cleanup.pointerRectHandler, true);
        stage.removeEventListener('pointerdown', cleanup.pointerRectHandler, true);
      }
      cleanup.pointerRectHandler = null;
    }
    if (rectSyncFrameRef.current) {
      cancelAnimationFrame(rectSyncFrameRef.current);
      rectSyncFrameRef.current = 0;
    }
  };

  const onLoad = (spline) => {
    disposeSceneBindings();
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
      resizeTimeout = setTimeout(() => {
        updateLayout();
        syncPointerRect();
      }, 150);
    };

    window.addEventListener('resize', debouncedResize, { passive: true });
    cleanupRef.current.resizeHandler = debouncedResize;

    // El rect que Spline cacheó al arrancar la escena ya puede estar obsoleto:
    // el observer monta el visor 300px antes de que entre en pantalla.
    syncPointerRect();

    // `capture: true` es lo que hace que también lleguen los scrolls de
    // scrollers internos como .pageWrapper del inicio: los eventos `scroll` de
    // un elemento no burbujean, pero sí bajan por la fase de captura.
    const onScrollRect = () => scheduleRectSync();
    window.addEventListener('scroll', onScrollRect, { capture: true, passive: true });
    cleanupRef.current.scrollRectHandler = onScrollRect;

    // Red de seguridad para todo lo que mueve el canvas sin scroll ni resize
    // (animaciones de entrada, imágenes que cargan más arriba, fuentes). Como
    // el contenedor es ancestro del canvas, en captura corremos antes que el
    // handler de Spline y ese mismo evento ya usa el rect corregido.
    const stage = containerRef.current;
    if (stage) {
      const onPointerRect = () => syncPointerRect();
      stage.addEventListener('pointerenter', onPointerRect, true);
      stage.addEventListener('pointermove', onPointerRect, true);
      stage.addEventListener('pointerdown', onPointerRect, true);
      cleanupRef.current.pointerRectHandler = onPointerRect;
    }

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
    // Pausamos cuando el canvas está fuera de pantalla o la pestaña está en
    // segundo plano, para que el ritmo del gato sea el mismo en todas las
    // páginas (antes seguía avanzando oculto y al volver aparecía en un frame
    // arbitrario, a veces con las dos patas quietas).
    const interval = setInterval(() => {
        if (!isVisibleRef.current || document.hidden) return;
        if (i % 2) {
          frame1.visible = false;
          frame2.visible = true;
        } else {
          frame1.visible = true;
          frame2.visible = false;
        }
        i++;
    }, BONGO_FRAME_MS);

    cleanupRef.current.bongoInterval = interval;
  };

  useEffect(() => {
    return () => {
      disposeSceneBindings();
      const cleanup = cleanupRef.current;
      if (cleanup.visibilityObserver) {
        cleanup.visibilityObserver.disconnect();
        cleanup.visibilityObserver = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Separamos dos acciones con costes muy distintos:
  //   1. PRECALENTAR runtime JS + escena (sólo red, no bloquea el hilo) — en
  //      idle tras la carga y, como respaldo, con margen amplio de scroll.
  //   2. MONTAR el visor Spline (caro: construye la escena 3D de forma
  //      síncrona, bloqueando el hilo ~1s). Esto sólo debe ocurrir cuando el
  //      teclado está cerca de entrar en pantalla — no en medio de los
  //      marquees de /capitulo, donde congelaba el scroll.
  useEffect(() => {
    if (shouldLoad) return;

    // 1a. Precalentamiento en idle: con los bytes ya en caché, el montaje sólo
    // paga el init de la escena y el gato aparece casi al instante.
    let idleId = null;
    let idleTimer = null;
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(warmupSplineAssets, { timeout: 3500 });
    } else {
      idleTimer = setTimeout(warmupSplineAssets, 2500);
    }

    const el = containerRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    // 1b. Respaldo por scroll (margen amplio) por si el idle aún no corrió.
    const prefetchObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          warmupSplineAssets();
          prefetchObserver.disconnect();
        }
      },
      { rootMargin: '600px' }
    );
    prefetchObserver.observe(el);

    // 2. Montaje cercano: 300px de margen para que el init termine justo
    // cuando la sección entra en pantalla, sin trabar el scroll previo.
    const mountObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          mountObserver.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    mountObserver.observe(el);

    return () => {
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (idleTimer !== null) clearTimeout(idleTimer);
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
      className={STAGE_CLASS}
      style={{ pointerEvents: 'auto', contain: 'layout paint' }}
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
