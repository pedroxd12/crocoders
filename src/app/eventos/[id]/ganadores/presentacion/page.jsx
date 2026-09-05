'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { AnimatePresence, motion } from 'framer-motion';
import { Trophy, ChevronLeft, ChevronRight, X, Medal } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { etiquetaPosicion } from '@/lib/ganadores';

/**
 * Presentación a pantalla completa de los ganadores, para proyectar en el
 * cierre del evento. Se avanza con Espacio / flechas / clic; cada paso revela
 * un ganador, del último lugar al primero, desafío por desafío y al final la
 * clasificación general. Esc vuelve al podio.
 *
 * Es la web misma (fondo oscuro, verde de marca), sin librerías nuevas:
 * framer-motion ya está en el proyecto.
 */

const ESTILO = {
  1: { texto: 'text-brand', borde: 'border-brand/50', glow: 'shadow-[0_0_120px_-20px_rgba(30,241,132,0.55)]' },
  2: { texto: 'text-fg', borde: 'border-line-strong', glow: 'shadow-[0_0_100px_-30px_rgba(255,255,255,0.25)]' },
  3: { texto: 'text-accent', borde: 'border-accent/50', glow: 'shadow-[0_0_100px_-30px_rgba(246,146,44,0.45)]' },
};
const estiloDe = (pos) => ESTILO[pos] || { texto: 'text-muted', borde: 'border-line', glow: '' };

// Partículas de celebración (CSS puro): 24 puntos que caen con distinto
// retraso. Sólo se pintan en el primer lugar.
function Confeti() {
  const piezas = useMemo(
    () => Array.from({ length: 24 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      delay: `${(i % 8) * 0.18}s`,
      dur: `${2.4 + (i % 5) * 0.35}s`,
      color: i % 3 === 0 ? 'bg-brand' : i % 3 === 1 ? 'bg-warning' : 'bg-info',
      size: 6 + (i % 4) * 3,
    })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {piezas.map((p, i) => (
        <span
          key={i}
          className={`absolute -top-4 block rounded-sm ${p.color} animate-confeti`}
          style={{ left: p.left, width: p.size, height: p.size * 1.6, animationDelay: p.delay, animationDuration: p.dur }}
        />
      ))}
      <style jsx>{`
        @keyframes confeti-caida {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(110vh) rotate(540deg); opacity: 0.2; }
        }
        .animate-confeti { animation-name: confeti-caida; animation-timing-function: linear; animation-iteration-count: infinite; }
      `}</style>
    </div>
  );
}

export default function PresentacionGanadores() {
  const { id } = useParams();
  const router = useRouter();
  const { data, isLoading } = useSWR(id ? `/api/eventos/${id}/ganadores` : null, fetcher, {
    revalidateOnFocus: false,
  });

  // Secuencia de pasos: portada → (por cada desafío: título, luego ganadores
  // del último al primero) → (general: título, ganadores) → cierre.
  const pasos = useMemo(() => {
    if (!data) return [];
    const lista = [{ tipo: 'portada' }];
    const bloques = [
      ...data.retos.map((r) => ({ titulo: r.titulo, subtitulo: r.patrocinador ? `Desafío · ${r.patrocinador}` : 'Desafío', ganadores: r.ganadores })),
      ...(data.general.length ? [{ titulo: data.retos.length ? 'Clasificación general' : 'Ganadores', subtitulo: null, ganadores: data.general }] : []),
    ];
    for (const b of bloques) {
      if (!b.ganadores.length) continue;
      lista.push({ tipo: 'bloque', titulo: b.titulo, subtitulo: b.subtitulo });
      const ordenados = [...b.ganadores].sort((a, z) => z.posicion - a.posicion);
      for (const g of ordenados) lista.push({ tipo: 'ganador', bloque: b.titulo, ganador: g });
    }
    lista.push({ tipo: 'cierre' });
    return lista;
  }, [data]);

  const [indice, setIndice] = useState(0);
  const avanzar = useCallback(() => setIndice((i) => Math.min(i + 1, pasos.length - 1)), [pasos.length]);
  const retroceder = useCallback(() => setIndice((i) => Math.max(i - 1, 0)), []);
  const salir = useCallback(() => router.push(`/eventos/${id}/ganadores`), [router, id]);

  useEffect(() => {
    const onKey = (e) => {
      if (['ArrowRight', ' ', 'Enter', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        avanzar();
      } else if (['ArrowLeft', 'Backspace', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        retroceder();
      } else if (e.key === 'Escape') {
        salir();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [avanzar, retroceder, salir]);

  const paso = pasos[indice];
  const sinDatos = !isLoading && (!data || (!data.publicado && !data.vista_previa) || pasos.length <= 2);

  return (
    <div
      className="fixed inset-0 z-50 flex select-none flex-col bg-bg text-fg"
      onClick={avanzar}
      role="presentation"
    >
      <div className="dot-pattern" aria-hidden="true" />

      {/* Controles discretos. */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={retroceder} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Anterior">
          <ChevronLeft size={20} />
        </button>
        <span className="px-2 text-xs tabular-nums text-faint">{pasos.length ? `${indice + 1} / ${pasos.length}` : ''}</span>
        <button type="button" onClick={avanzar} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Siguiente">
          <ChevronRight size={20} />
        </button>
        <button type="button" onClick={salir} className="ml-2 rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Salir">
          <X size={20} />
        </button>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-8">
        {sinDatos ? (
          <div className="text-center">
            <Trophy size={48} className="mx-auto mb-4 text-faint" aria-hidden="true" />
            <p className="text-xl font-semibold">No hay resultados para presentar.</p>
            <p className="mt-1 text-sm text-muted">Registra ganadores en el panel y vuelve a abrir esta pantalla.</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {paso?.tipo === 'portada' && (
              <motion.div
                key="portada"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.6 }}
                className="text-center"
              >
                <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.3em] text-brand">
                  <Trophy size={16} aria-hidden="true" /> Ganadores
                </p>
                <h1 className="mt-6 text-5xl font-black leading-tight md:text-7xl">{data.evento.nombre}</h1>
                <p className="mt-8 text-sm text-faint">Pulsa Espacio o haz clic para continuar</p>
              </motion.div>
            )}

            {paso?.tipo === 'bloque' && (
              <motion.div
                key={`bloque-${indice}`}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -40 }}
                transition={{ duration: 0.5 }}
                className="text-center"
              >
                {paso.subtitulo && (
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted">{paso.subtitulo}</p>
                )}
                <h2 className="mt-4 text-4xl font-black md:text-6xl">{paso.titulo}</h2>
              </motion.div>
            )}

            {paso?.tipo === 'ganador' && (() => {
              const g = paso.ganador;
              const e = estiloDe(g.posicion);
              const primero = g.posicion === 1;
              return (
                <motion.div
                  key={`ganador-${indice}`}
                  initial={{ opacity: 0, scale: 0.9, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -30 }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                  className="relative w-full max-w-4xl"
                >
                  {primero && <Confeti />}
                  <p className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-faint">{paso.bloque}</p>
                  <div className={`relative mt-4 rounded-3xl border bg-surface/90 p-8 text-center backdrop-blur md:p-12 ${e.borde} ${e.glow}`}>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className={`text-lg font-bold uppercase tracking-[0.25em] md:text-2xl ${e.texto}`}
                    >
                      {etiquetaPosicion(g.posicion, g.titulo)}
                    </motion.p>
                    <motion.h2
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.35, duration: 0.5 }}
                      className="mt-4 text-4xl font-black leading-tight md:text-6xl"
                    >
                      {g.nombre}
                    </motion.h2>
                    {g.institucion && <p className="mt-2 text-lg text-muted">{g.institucion}</p>}
                    {g.tipo === 'equipo' && g.integrantes?.length > 0 && (
                      <motion.ul
                        initial="oculto"
                        animate="visible"
                        variants={{ visible: { transition: { staggerChildren: 0.12, delayChildren: 0.6 } } }}
                        className="mt-6 flex flex-wrap justify-center gap-2"
                      >
                        {g.integrantes.map((p, i) => (
                          <motion.li
                            key={i}
                            variants={{ oculto: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-base text-fg md:text-lg"
                          >
                            {p.nombre}
                            {p.es_capitan && <span className="ml-1.5 text-xs font-semibold text-brand">capitán</span>}
                          </motion.li>
                        ))}
                      </motion.ul>
                    )}
                    {g.premio && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.9 }}
                        className="mt-6 inline-flex items-center gap-2 text-lg font-semibold text-warning"
                      >
                        <Medal size={18} aria-hidden="true" /> {g.premio}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              );
            })()}

            {paso?.tipo === 'cierre' && (
              <motion.div
                key="cierre"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
                className="text-center"
              >
                <Trophy size={56} className="mx-auto mb-6 text-brand" aria-hidden="true" />
                <h2 className="text-4xl font-black md:text-6xl">¡Felicidades a todos!</h2>
                <p className="mt-4 text-lg text-muted">{data.evento.nombre}</p>
                <p className="mt-10 text-sm text-faint">Esc para volver al podio</p>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
