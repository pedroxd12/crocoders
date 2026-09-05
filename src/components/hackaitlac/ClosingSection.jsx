'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './hackaitlac.module.css';
import { formatearFechaHora } from '@/lib/fechas';
import { textoRestantes } from '@/lib/aforo';
import { acquireScroll, releaseScroll, revealLines } from './scroll-engine';

const CONTACTO = 'hackaitlac@lcardenas.tecnm.mx';

/**
 * Cierre: premio, llamada al registro y pie con las instituciones.
 *
 * `evento` llega del sistema de eventos (el que tiene slug 'hackaitlac'): con
 * él, el botón lleva al formulario real y las fechas y los lugares que quedan
 * son los de la base. Sin él —contenido de respaldo— se mantiene el correo del
 * comité, que es lo que había antes de que la convocatoria fuera gestionable.
 */
export default function ClosingSection({ zIndex = 7, evento = null, premio = null }) {
  const sectionRef = useRef(null);
  const titleRef = useRef(null);

  const registroCerrado = Boolean(evento?.registro_cerrado || evento?.evento_terminado);
  const premioTexto = premio || (evento ? null : '$15,000');
  const lugaresLibres = evento?.lugares_libres;

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;

    acquireScroll().then((libs) => {
      if (cancelled) return;
      cleanup = revealLines(titleRef.current, libs, { trigger: sectionRef.current, start: 'top 78%' });
    });

    return () => {
      cancelled = true;
      cleanup();
      releaseScroll();
    };
  }, []);

  return (
    <section
      id="registro"
      ref={sectionRef}
      className={styles.closing}
      style={{ zIndex }}
      aria-label="Premio y registro"
    >
      <div className={styles.closingGlow} aria-hidden="true" />

      <div className={styles.closingInner}>
        <div className={styles.prize}>
          {premioTexto && (
            <p className={styles.prizeAmount}>
              {premioTexto}
              <small>
                {premio ? 'Al primer lugar de cada desafío' : 'MXN al primer lugar de cada desafío'}
              </small>
            </p>
          )}
          <p className={styles.prizeCopy}>
            Además del premio económico, el equipo ganador de cada desafío recibe un reconocimiento
            oficial. Todos los participantes obtienen constancia digital descargable, y los
            proyectos pueden vincularse con la empresa o institución que patrocina el desafío.
          </p>
        </div>

        <div className={styles.ctaBlock}>
          <h2 className={styles.ctaTitle} ref={titleRef}>
            Reúne a tu equipo y <em>elige tu desafío</em>
          </h2>
          <p className={styles.ctaCopy}>
            {evento ? (
              <>
                {registroCerrado
                  ? 'El periodo de inscripción ya terminó.'
                  : evento.fecha_limite_registro
                    ? `El registro cierra el ${formatearFechaHora(evento.fecha_limite_registro)}, o antes si se agotan los espacios.`
                    : 'El registro está abierto hasta agotar los espacios disponibles.'}
                {typeof lugaresLibres === 'number' && !registroCerrado
                  ? ` ${textoRestantes(lugaresLibres, evento.unidad_aforo || 'equipos')}.`
                  : ''}{' '}
                Un solo desafío por equipo.
              </>
            ) : (
              'El registro está abierto hasta agotar los espacios disponibles. Un solo desafío por equipo.'
            )}
          </p>
          <div className={styles.ctaActions}>
            {/* Con evento configurado, el botón entra al formulario real de
                inscripción (el mismo de /eventos, con sus cupos y su ticket).
                Sin él, se mantiene el correo del comité. */}
            {evento ? (
              registroCerrado ? (
                <span className={styles.btnDisabled} aria-disabled="true">
                  Registro cerrado
                </span>
              ) : (
                <Link className={styles.btnGold} href={evento.url_registro}>
                  Registrar mi equipo
                  <span className={styles.btnArrow} aria-hidden="true">
                    →
                  </span>
                </Link>
              )
            ) : (
              <a
                className={styles.btnGold}
                href={`mailto:${CONTACTO}?subject=${encodeURIComponent('Registro HackaItlac')}`}
              >
                Registrar mi equipo
                <span className={styles.btnArrow} aria-hidden="true">
                  →
                </span>
              </a>
            )}
            <a className={styles.btnOutline} href={`mailto:${CONTACTO}`}>
              Escribir al comité
            </a>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerOrgs}>
          <span className={styles.orgChip}>
            <Image
              src="/hackaitlac/org-tecnm.png"
              alt="Tecnológico Nacional de México"
              width={288}
              height={127}
              sizes="150px"
            />
          </span>
          <span className={styles.orgChip}>
            <Image
              src="/hackaitlac/org-itlac.png"
              alt="Instituto Tecnológico de Lázaro Cárdenas"
              width={413}
              height={256}
              sizes="80px"
            />
          </span>
          <span className={styles.orgChip}>
            <Image
              src="/img/society.png"
              alt="IEEE Computer Society"
              width={2500}
              height={765}
              sizes="150px"
            />
          </span>
        </div>
        <div className={styles.footerMeta}>
          <span>
            Organiza: Academia de Ingeniería en Sistemas Computacionales · Capítulo estudiantil IEEE
            Computer Society
          </span>
          <span>
            Informes: <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>
          </span>
          <span>
            <Link href="/">← Volver a Crocoders</Link>
          </span>
        </div>
      </footer>
    </section>
  );
}
