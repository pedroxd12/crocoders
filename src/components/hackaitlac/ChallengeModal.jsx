'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './hackaitlac.module.css';
import ChallengeArt from './ChallengeArt';
import { pauseScroll, resumeScroll } from './scroll-engine';

const CONTACTO = 'hackaitlac@lcardenas.tecnm.mx';

/** "5 integrantes + asesor" a partir de la configuración real del concurso. */
function composicionEquipo(evento) {
  const min = Number(evento?.min_integrantes_equipo) || null;
  const max = Number(evento?.max_integrantes_equipo) || null;
  if (!max) return null;
  const rango = min && min !== max ? `${min}-${max} integrantes` : `${max} integrantes`;
  const asesor = evento?.requiere_asesor && !evento?.asesor_participa ? ' + asesor' : '';
  return `${rango}${asesor}`;
}

export default function ChallengeModal({ challenge, evento = null, onClose }) {
  const equipo = composicionEquipo(evento);
  const registroCerrado = Boolean(evento?.registro_cerrado || evento?.evento_terminado);
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
          /* Lenis, mientras está detenido, hace preventDefault() sobre TODA la
             rueda del ratón (ver onVirtualScroll en lenis.mjs: el bloque
             `isStopped` va después de esta comprobación). Sin este atributo el
             contenido del modal no se podía desplazar. */
          data-lenis-prevent=""
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
                {challenge.imagen ? (
                  <Image
                    src={challenge.imagen}
                    alt=""
                    fill
                    sizes="200px"
                    className={styles.modalArtImg}
                  />
                ) : (
                  <ChallengeArt id={challenge.id} />
                )}
              </div>
            </header>

            <div className={styles.modalScroll}>
              <div className={styles.modalBody}>
                <div>
                  {challenge.body && (
                    <div className={styles.modalBlock}>
                      <p className={styles.modalBlockTitle}>El reto</p>
                      <p className={styles.modalText}>{challenge.body}</p>
                    </div>
                  )}

                  {challenge.entregable && (
                    <div className={styles.modalBlock}>
                      <p className={styles.modalBlockTitle}>Qué se entrega</p>
                      <p className={styles.modalText}>{challenge.entregable}</p>
                    </div>
                  )}

                  <div className={styles.modalBlock}>
                    <p className={styles.modalBlockTitle}>Herramientas permitidas</p>
                    <p className={styles.modalText}>
                      Libertad total: programación, inteligencia artificial, ciencia de datos y los
                      componentes mecánicos, electrónicos o físicos que el equipo considere
                      necesarios. Cada equipo lleva su propio material y equipo de trabajo.
                    </p>
                  </div>
                </div>

                <div>
                  {challenge.criteria?.length > 0 && (
                    <div className={styles.modalBlock}>
                      <p className={styles.modalBlockTitle}>Criterios de evaluación</p>
                      <ul className={styles.modalList}>
                        {challenge.criteria.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Sólo los datos que existen de verdad. El cupo sale de las
                      inscripciones reales del desafío, así que aquí se ve si
                      todavía cabe un equipo. */}
                  <div className={styles.modalBlock}>
                    <p className={styles.modalBlockTitle}>En corto</p>
                    <ul className={styles.modalFacts}>
                      {challenge.patrocinador && (
                        <li>
                          <span>Patrocina</span>
                          <span>{challenge.patrocinador}</span>
                        </li>
                      )}
                      {equipo && (
                        <li>
                          <span>Equipo</span>
                          <span>{equipo}</span>
                        </li>
                      )}
                      {challenge.cupo != null && (
                        <li>
                          <span>Cupo</span>
                          <span>
                            {challenge.lleno
                              ? 'Lleno'
                              : `${challenge.disponibles} de ${challenge.cupo} equipos`}
                          </span>
                        </li>
                      )}
                      {challenge.premio && (
                        <li>
                          <span>1er lugar</span>
                          <span>{challenge.premio}</span>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              <p className={styles.modalNote}>
                Los detalles técnicos del desafío se envían por correo al aceptar el registro del
                equipo.
              </p>
            </div>

            <footer className={styles.modalFooter}>
              {/* Con el desafío publicado desde el panel, el botón lleva al
                  formulario real con el desafío ya elegido (?reto=) y el cupo
                  lo comprueba el servidor al registrar. Sin evento configurado
                  (contenido de respaldo) queda el correo del comité. */}
              {challenge.href ? (
                challenge.lleno ? (
                  <span className={styles.btnDisabled} aria-disabled="true">
                    Cupo lleno en este desafío
                  </span>
                ) : registroCerrado ? (
                  <span className={styles.btnDisabled} aria-disabled="true">
                    Registro cerrado
                  </span>
                ) : (
                  <Link className={styles.btnPrimary} href={challenge.href}>
                    Registrar equipo en este desafío
                    <span className={styles.btnArrow} aria-hidden="true">
                      →
                    </span>
                  </Link>
                )
              ) : (
                <a
                  className={styles.btnPrimary}
                  href={`mailto:${CONTACTO}?subject=${encodeURIComponent(
                    `Registro HackaItlac — Desafío ${challenge.index}: ${challenge.title}`,
                  )}`}
                >
                  Registrar equipo en este desafío
                  <span className={styles.btnArrow} aria-hidden="true">
                    →
                  </span>
                </a>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
