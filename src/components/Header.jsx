"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./Header.module.css";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const tl = useRef(null);
  const gsapCtxRef = useRef(null);
  const pathRef = useRef(null);
  const hamburgerRef = useRef(null);
  const toggleBtnRef = useRef(null);
  const menuRef = useRef(null);
  const btnOutline1Ref = useRef(null);
  const btnOutline2Ref = useRef(null);

  const { user, logout } = useAuth();
  const gsapRef = useRef(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Construye (o reconstruye) el timeline a partir del DOM actual. Lo separamos
  // de la carga de la librería para poder rehacerlo cuando cambian los enlaces
  // del menú (p. ej. al iniciar/cerrar sesión).
  const buildTimeline = (gsap) => {
    // Limpia un timeline previo antes de reconstruir.
    if (gsapCtxRef.current) {
      gsapCtxRef.current.revert();
      gsapCtxRef.current = null;
      tl.current = null;
    }

    gsapCtxRef.current = gsap.context(() => {
      tl.current = gsap.timeline({ paused: true });

      gsap.set(menuRef.current, { autoAlpha: 0 });

      const start = "M0 502S175 272 500 272s500 230 500 230V0H0Z";
      const end = "M0,1005S175,995,500,995s500,5,500,5V0H0Z";
      const power4 = "power4.inOut";

      tl.current.to(hamburgerRef.current, {
        duration: 1.25,
        marginTop: "-5px",
        x: -40,
        y: 40,
        ease: power4,
      });

      const outlines = [btnOutline1Ref.current, btnOutline2Ref.current];

      tl.current.to(
        outlines,
        {
          duration: 1.25,
          x: -40,
          y: 40,
          width: "140px",
          height: "140px",
          border: "1px solid #e2e2dc",
          ease: power4,
        },
        "<"
      );

      tl.current
        .to(pathRef.current, { duration: 0.8, attr: { d: start }, ease: "power2.in" }, "<")
        .to(pathRef.current, { duration: 0.8, attr: { d: end }, ease: "power2.out" }, "-=0.5");

      tl.current.to(menuRef.current, { duration: 1, autoAlpha: 1 }, "-=0.5");

      const menuLinks = menuRef.current.querySelectorAll(`.${styles.menuItem} > a`);

      tl.current.to(
        menuLinks,
        {
          duration: 1,
          y: 0,
          ease: "power3.out",
          stagger: { amount: 0.5 },
        },
        "-=1"
      );
    });

    return tl.current;
  };

  // Cargamos GSAP de forma diferida en un efecto tras el montaje — no en el
  // handler de clic. Bajo Turbopack dev, `await import()` dentro del handler de
  // un evento puede quedar colgado sin resolver, dejando el menú sin responder.
  // Cargarlo aquí evita ese problema y sigue sin bloquear el render inicial.
  useEffect(() => {
    let cancelled = false;
    import("gsap")
      .then((mod) => {
        if (cancelled) return;
        gsapRef.current = mod.default || mod.gsap || mod;
      })
      .catch((err) => {
        console.error("No se pudo cargar GSAP para el menú:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureTimeline = () => {
    if (tl.current) return tl.current;
    if (!gsapRef.current) return null;
    return buildTimeline(gsapRef.current);
  };

  // Si el contenido del menú cambia (login/logout añade o quita enlaces) y el
  // timeline ya existía, lo reconstruimos para que los nuevos enlaces se animen
  // en vez de quedarse ocultos en translateY(100px). Preservamos el estado
  // abierto saltando al final del timeline reconstruido.
  useEffect(() => {
    if (gsapRef.current && tl.current) {
      buildTimeline(gsapRef.current);
      if (isOpen && tl.current) tl.current.progress(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, user]);

  useEffect(() => {
    return () => {
      if (gsapCtxRef.current) gsapCtxRef.current.revert();
    };
  }, []);

  const toggleMenu = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    const timeline = ensureTimeline();
    if (!timeline) return; // GSAP aún no terminó de cargar; al cargar se podrá reabrir

    if (nextState) {
      timeline.play();
    } else {
      timeline.reverse();
    }
  };

  const handleLinkClick = () => {
    if (isOpen) {
      setIsOpen(false);
      if (tl.current) {
        tl.current.reverse();
      }
    }
  };

  const handleLogout = async (e) => {
    e.preventDefault();
    handleLinkClick();
    if (logout) await logout();
  };

  return (
    <div className={styles.headerContainer}>
        {/* Toggle Button */}
        <div className={styles.toggleBtn} onClick={toggleMenu} ref={toggleBtnRef}>
            <div ref={btnOutline1Ref} className={`${styles.btnOutline} ${styles.btnOutline1}`}></div>
            <div ref={btnOutline2Ref} className={`${styles.btnOutline} ${styles.btnOutline2}`}></div>
            <div className={`${styles.hamburger} ${isOpen ? styles.active : ''}`} ref={hamburgerRef}>
                <span></span>
            </div>
        </div>

        {/* Overlay SVG */}
        <div className={styles.overlay}>
             <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <path ref={pathRef} d="M0 2S175 1 500 1s500 1 500 1V0H0Z"></path>
            </svg>
        </div>

        {/* Full Screen Menu */}
        <div className={styles.menu} ref={menuRef}>
            <div className={styles.primaryMenu}>
                <div className={styles.menuContainer}>
                    <div className={styles.wrapper}>
                        <div className={styles.menuItem}>
                             <Link href="/" onClick={handleLinkClick}>
                                <span>I</span> Inicio
                             </Link>
                        </div>
                        <div className={styles.menuItem}>
                             <Link href="/capitulo" onClick={handleLinkClick}>
                                <span>II</span> Computer Society
                             </Link>
                        </div>
                        <div className={styles.menuItem}>
                             <Link href="/eventos" onClick={handleLinkClick}>
                                <span>III</span> Eventos
                             </Link>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.secondaryMenu}>
                <div className={styles.menuContainer}>
                    <div className={styles.wrapper}>
                        <div className={styles.menuItem}>
                            {isMounted && user ? (
                                <Link href={user.role === 'administrador' ? '/admin' : '/dashboard'} onClick={handleLinkClick}>
                                    Mi Perfil
                                </Link>
                            ) : (
                                <Link href="/iniciar" onClick={handleLinkClick}>
                                    Iniciar Sesión
                                </Link>
                            )}
                        </div>

                        <div className={styles.menuItem}>
                             <Link href="/puntajes" onClick={handleLinkClick}>Puntajes</Link>
                        </div>

                         <div className={styles.menuItem}>
                             <Link href="/evidencias" onClick={handleLinkClick}>Evidencias</Link>
                        </div>

                        <div className={styles.menuItem}>
                             <Link href="/contacto" onClick={handleLinkClick}>Contacto</Link>
                        </div>
                         {isMounted && user && (
                             <div className={styles.menuItem}>
                                 <a href="#" onClick={handleLogout}>
                                     Cerrar Sesión
                                 </a>
                             </div>
                         )}
                    </div>

                    <div className={styles.wrapper} style={{ flex: 0, marginTop: 'auto' }}>
                         <div className={styles.menuItem}>
                             <span className="text-gray-500 text-sm">© 2026 Crocoders</span>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}
