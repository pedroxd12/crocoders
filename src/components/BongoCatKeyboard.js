'use client';

import React, { useRef, useState, Suspense } from 'react';
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

  const onLoad = (spline) => {
    setSplineApp(spline);
    
    const updateLayout = () => {
        const keyboard = spline.findObjectByName("keyboard");
        const isMobile = window.matchMedia("(max-width: 768px)").matches;

        if (keyboard) {
            if (isMobile) {
                // Configuración MÓVIL - Optimizada para evitar cortes
                 keyboard.scale.x = 0.1; 
                 keyboard.scale.y = 0.1;
                 keyboard.scale.z = 0.1;
                 
                 // Centrado más preciso
                 keyboard.position.x = 0;
                 keyboard.position.y = 15; // Un poco más arriba para que quepa el footer/texto si hay
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

    // Ejecutar layout inicial
    updateLayout();

    // Escuchar cambios de tamaño
    window.addEventListener('resize', updateLayout);
    // Guardar referencia para limpiar listener si fuera necesario (aunque onLoad es único del componente spline)
    spline._resizeHandler = updateLayout;

    // Habilitar interacción
    spline.addEventListener("mouseHover", (e) => handleMouseHover(e, spline));
    spline.addEventListener("mouseDown", (e) => handleKeyPress(e, spline));
    
    // Habilitar eventos de teclado si existen en spline
    try {
        spline.addEventListener("keyDown", (e) => handleKeyPress(e, spline));
    } catch (err) {
        console.log("keyDown event not available");
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
    
    console.log("Key pressed:", e.target.name); // Para debug
    
    const skill = SKILLS[e.target.name];
    if (skill) {
        console.log("Skill found:", skill.label);
        
        // Actualizar variables de texto en Spline cuando se presiona
        try {
            if (spline.getVariable("heading") !== undefined) {
                spline.setVariable("heading", skill.label);
                spline.setVariable("desc", skill.shortDescription);
            }
        } catch (err) {
            console.log("Could not set variables:", err);
        }
        
        // Efecto visual: hacer que la tecla baje un poco cuando se presiona
        const keycap = e.target; // Usar directamente el target del evento
        if (keycap && keycap.position) {
            const originalY = keycap.position.y;
            keycap.position.y = originalY - 10; // Bajar
            
            // Volver a la posición original después de un momento
            setTimeout(() => {
                if (keycap.position) {
                    keycap.position.y = originalY;
                }
            }, 150);
        }
    } else {
        console.log("No skill found for:", e.target.name);
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

    spline._bongoInterval = interval; 
  };
  
  React.useEffect(() => {
      return () => {
          if (splineApp) {
              if (splineApp._bongoInterval) {
                  clearInterval(splineApp._bongoInterval);
              }
              if (splineApp._resizeHandler) {
                  window.removeEventListener('resize', splineApp._resizeHandler);
              }
          }
      };
  }, [splineApp]);

  return (
    <Suspense fallback={<div className="w-full h-full flex items-center justify-center">Cargando...</div>}>
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
