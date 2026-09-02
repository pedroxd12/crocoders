'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './hackaitlac.module.css';
import { scrollToId } from './scroll-engine';

const LINKS = [
  { id: 'evento', label: 'El evento' },
  { id: 'bases', label: 'Bases' },
  { id: 'desafios', label: 'Desafíos' },
  { id: 'cronograma', label: 'Cronograma' },
];

/**
 * Barra superior propia de HackaItlac. La página oculta el header global del
 * sitio (AppShell) porque es full-bleed, así que sin esto no había forma de
 * saltar entre secciones ni de volver al sitio principal desde arriba.
 */
export default function HackNav({ mostrarDesafios = true }) {
  const [solid, setSolid] = useState(false);

  // Sin desafíos publicados esa sección no se pinta: dejar el enlace sería un
  // botón que no lleva a ningún sitio (scrollToId no encuentra el ancla).
  const links = mostrarDesafios ? LINKS : LINKS.filter((l) => l.id !== 'desafios');

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`${styles.nav} ${solid ? styles.navSolid : ''}`} aria-label="Secciones">
      <a
        className={styles.navBrand}
        href="#inicio"
        onClick={(e) => {
          e.preventDefault();
          scrollToId('inicio', 0);
        }}
      >
        <Image src="/hackaitlac/emblem.png" alt="" width={612} height={633} sizes="30px" />
        <span className={styles.navBrandText}>
          Hacka<em>Itlac</em> 2026
        </span>
      </a>

      <div className={styles.navLinks}>
        {links.map((link) => (
          <button
            key={link.id}
            type="button"
            className={styles.navLink}
            onClick={() => scrollToId(link.id)}
          >
            {link.label}
          </button>
        ))}
        <Link className={styles.navBack} href="/">
          ← Crocoders
        </Link>
      </div>

      <a
        className={styles.navCta}
        href="#registro"
        onClick={(e) => {
          e.preventDefault();
          scrollToId('registro');
        }}
      >
        Registrarme
      </a>
    </nav>
  );
}
