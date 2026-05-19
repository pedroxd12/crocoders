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

export default function BongoCatKeyboard() {
  const [splineApp, setSplineApp] = useState(null);
  const selectedSkillRef = useRef(null);
  const cleanupRef = useRef({ resizeHandler: null, bongoInterval: null });

  const onLoad = (spline) => {
    setSplineApp(spline);

    const updateLayout = () => {
        const keyboard = spline.findObjectByName("keyboard");
        const isMobile = window.matchMedia("(max-width: 768px)").matches;

        if (keyboard) {
            if (isMobile) {
                // Configuración MÓVIL - Aún más pequeña y ajustada
                 keyboard.scale.x = 0.07; 
                 keyboard.scale.y = 0.07;
                 keyboard.scale.z = 0.07;
                 
                 // Centrado y levantado ligeramente
                 keyboard.position.x = 0;
                 keyboard.position.y = 15; 
                 keyboard.position.z = 0;
            } else {
                 // Configuración DESKTOP
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

        // Asegurar visibilidad de objetos
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

        // Asegurar que las teclas base sean visibles siempre
        const keycaps = allObjects.filter((obj) => obj.name === "keycap");
        keycaps.forEach(k => k.visible = true);
    };

    updateLayout();

    window.addEventListener('resize', updateLayout);
    cleanupRef.current.resizeHandler = updateLayout;

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
       // Resetear si se sale del teclado
       if (spline.getVariable("heading") && spline.getVariable("desc")) {
            spline.setVariable("heading", "");
            spline.setVariable("desc", "");
       }
    } else {
       const skill = SKILLS[e.target.name];
       if (skill) {
           // Actualizar variables de texto en Spline si existen
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
    const interval = setInterval(() => {
        if (i % 2) {
          frame1.visible = false;
          frame2.visible = true;
        } else {
          frame1.visible = true;
          frame2.visible = false;
        }
        i++;
    }, 100);

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
    };
  }, []);

  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center bg-gray-900/30 rounded-lg animate-pulse">
          <span className="text-gray-500 text-sm">Cargando experiencia 3D...</span>
        </div>
      }
    >
      <div className="w-full h-full relative" style={{ pointerEvents: 'auto' }}>
        <Spline
          scene="/teclado/skills-keyboard.spline"
          onLoad={onLoad}
          className="w-full h-full"
          style={{ pointerEvents: 'auto' }}
        />
      </div>
    </Suspense>
  );
}
