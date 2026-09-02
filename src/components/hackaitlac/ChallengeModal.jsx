'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './hackaitlac.module.css';
import ChallengeArt from './ChallengeArt';
import { pauseScroll, resumeScroll } from './scroll-engine';

const CONTACTO = 'hackaitlac@lcardenas.tecnm.mx';

export default function ChallengeModal({ challenge, onClose }) {
  const closeRef = useRef(null);
  const lastFocused = useRef(null);

  useEffect(() => {
    if (!challenge) return undefined;

    lastFocused.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    pauseScroll();
    closeRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      resumeScroll();
      if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
    };
  }, [challenge, onClose]);

  return (
    <AnimatePresence>
      {challenge && (
        <motion.div
          className={styles.modalOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          <motion.div
            className={`${styles.modal} ${styles[`modalTone${challenge.tone}`] || ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hk-modal-title"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={closeRef}
              type="button"
              className={styles.modalClose}
              onClick={onClose}
              aria-label="Cerrar"
            >
              ✕
            </button>

            <header className={styles.modalBanner}>
              <div>
                <p className={styles.modalIndex}>Desafío {challenge.index}</p>
                <h3 className={styles.modalTitle} id="hk-modal-title">
                  {challenge.title}
                </h3>
                <p className={styles.modalLede}>{challenge.lede}</p>
              </div>
              <div className={styles.modalArt} aria-hidden="true">
                <ChallengeArt id={challenge.id} />
              </div>
            </header>

            <div className={styles.modalBody}>
              <div>
                <div className={styles.modalBlock}>
                  <p className={styles.modalBlockTitle}>El reto</p>
                  <p className={styles.modalText}>{challenge.body}</p>
                </div>

                <div className={styles.modalBlock}>
                  <p className={styles.modalBlockTitle}>Qué se entrega</p>
                  <p className={styles.modalText}>{challenge.entregable}</p>
                </div>

                <div className={styles.modalBlock}>
                  <p className={styles.modalBlockTitle}>Herramientas permitidas</p>
                  <p className={styles.modalText}>
                    Libertad total: programación, inteligencia artificial, ciencia de datos y los
                    componentes mecánicos, electrónicos o físicos que el equipo considere necesarios.
                    Cada equipo lleva su propio material y equipo de trabajo.
                  </p>
                </div>
              </div>

              <div>
                <div className={styles.modalBlock}>
                  <p className={styles.modalBlockTitle}>Criterios de evaluación</p>
                  <ul className={styles.modalList}>
                    {challenge.criteria.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>

                <div className={styles.modalBlock}>
                  <p className={styles.modalBlockTitle}>En corto</p>
                  <ul className={styles.modalFacts}>
                    <li>
                      <span>Patrocina</span>
                      <span>{challenge.patrocinador}</span>
                    </li>
                    <li>
                      <span>Equipo</span>
                      <span>5 integrantes + asesor</span>
                    </li>
                    <li>
                      <span>Exposición</span>
                      <span>5 min + 5 min de preguntas</span>
                    </li>
                    <li>
                      <span>1er lugar</span>
                      <span>$15,000 MXN</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <footer className={styles.modalFooter}>
              <span className={styles.modalFooterNote}>
                Los detalles técnicos se envían por correo al aceptar el registro del equipo.
              </span>
              <a
                className={styles.btnPrimary}
                href={`mailto:${CONTACTO}?subject=${encodeURIComponent(
                  `Registro HackaItlac 2026 — Desafío ${challenge.index}: ${challenge.title}`,
                )}`}
              >
                Registrar equipo en este desafío
                <span className={styles.btnArrow} aria-hidden="true">
                  →
                </span>
              </a>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
