'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Trophy, Presentation, Medal, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/LoadingSpinner';
import { fetcher } from '@/lib/fetcher';
import { useAuth } from '@/context/AuthContext';
import { formatearFechaLarga } from '@/lib/fechas';
import { etiquetaPosicion } from '@/lib/ganadores';

/**
 * Podio público de un evento. Se alimenta de /api/eventos/[id]/ganadores, que
 * sólo responde con datos cuando administración publicó los resultados (o
 * cuando quien mira es administrador, para ensayar). Misma estética oscura
 * del sitio: verde de marca para el primer lugar, sin colores inventados.
 */

const ESTILO_POSICION = {
  1: { anillo: 'ring-brand/60', fondo: 'bg-brand-soft', texto: 'text-brand', tam: 'md:scale-105' },
  2: { anillo: 'ring-line-strong', fondo: 'bg-surface-3', texto: 'text-fg', tam: '' },
  3: { anillo: 'ring-accent/50', fondo: 'bg-accent/10', texto: 'text-accent', tam: '' },
};
const estiloDe = (pos) => ESTILO_POSICION[pos] || { anillo: 'ring-line', fondo: 'bg-surface-2', texto: 'text-muted', tam: '' };

function TarjetaGanador({ g, indice }) {
  const e = estiloDe(g.posicion);
  return (
    <motion.li
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: Math.min(indice, 6) * 0.08, ease: 'easeOut' }}
      className={`relative rounded-2xl border border-line bg-surface p-5 ring-1 ${e.anillo} ${e.tam}`}
    >
      <div className="flex items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-black tabular-nums ${e.fondo} ${e.texto}`}>
          {g.posicion}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold uppercase tracking-wider ${e.texto}`}>
            {etiquetaPosicion(g.posicion, g.titulo)}
          </p>
          <h3 className="mt-1 text-xl font-bold leading-tight text-fg md:text-2xl">{g.nombre}</h3>
          {g.institucion && <p className="mt-0.5 text-sm text-muted">{g.institucion}</p>}
          {g.tipo === 'equipo' && g.integrantes?.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {g.integrantes.map((p, i) => (
                <li
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs text-muted"
                >
                  <Users size={11} aria-hidden="true" />
                  {p.nombre}
                  {p.es_capitan && <span className="text-[10px] font-semibold text-brand">· capitán</span>}
                </li>
              ))}
            </ul>
          )}
          {g.premio && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-warning">
              <Medal size={14} aria-hidden="true" /> {g.premio}
            </p>
          )}
        </div>
      </div>
    </motion.li>
  );
}

function Bloque({ titulo, subtitulo, ganadores }) {
  if (!ganadores?.length) return null;
  const ordenados = [...ganadores].sort((a, b) => a.posicion - b.posicion);
  return (
    <section className="mb-12">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-fg md:text-3xl">{titulo}</h2>
        {subtitulo && <p className="mt-1 text-sm text-muted">{subtitulo}</p>}
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ordenados.map((g, i) => <TarjetaGanador key={g.id_ganador} g={g} indice={i} />)}
      </ul>
    </section>
  );
}

export default function GanadoresEventoPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { data, error, isLoading } = useSWR(id ? `/api/eventos/${id}/ganadores` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const total = useMemo(() => (data ? data.general.length + data.retos.reduce((n, r) => n + r.ganadores.length, 0) : 0), [data]);
  const esAdmin = user?.role === 'administrador';

  if (isLoading && !data) return <LoadingSpinner fullScreen text="Cargando ganadores..." />;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-32 pb-20 text-center">
        <p className="text-danger">No se pudo cargar esta página.</p>
        <Button className="mt-4" variant="secondary" onClick={() => router.push('/eventos')}>Volver a eventos</Button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-bg pb-24 text-fg">
      <div className="mx-auto max-w-6xl px-6 pt-28 md:px-12">
        <Link href={`/eventos/${id}`} className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-fg">
          <ArrowLeft size={16} aria-hidden="true" /> Volver al evento
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand">
              <Trophy size={14} aria-hidden="true" /> Resultados
            </p>
            <h1 className="mt-2 text-4xl font-black leading-tight md:text-5xl">{data.evento.nombre}</h1>
            {data.evento.fecha_inicio && (
              <p className="mt-2 text-sm text-muted">{formatearFechaLarga(data.evento.fecha_inicio)}</p>
            )}
            {data.vista_previa && (
              <p className="mt-3 inline-block rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">
                Vista previa: los resultados aún no están publicados. Sólo los ve administración.
              </p>
            )}
          </div>
          {(data.publicado || esAdmin) && total > 0 && (
            <Button variant="secondary" onClick={() => router.push(`/eventos/${id}/ganadores/presentacion`)}>
              <Presentation size={16} aria-hidden="true" /> Modo presentación
            </Button>
          )}
        </motion.header>

        {!data.publicado && !data.vista_previa ? (
          <div className="rounded-2xl border border-line bg-surface p-10 text-center">
            <Trophy size={40} className="mx-auto mb-3 text-faint" aria-hidden="true" />
            <p className="text-lg font-semibold">Los resultados todavía no se han publicado.</p>
            <p className="mt-1 text-sm text-muted">Vuelve más tarde: aquí aparecerán los ganadores del evento.</p>
          </div>
        ) : total === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-10 text-center text-muted">Sin ganadores registrados.</div>
        ) : (
          <>
            {data.retos.map((r) => (
              <Bloque
                key={r.id_reto}
                titulo={r.titulo}
                subtitulo={r.patrocinador ? `Desafío · ${r.patrocinador}` : 'Desafío'}
                ganadores={r.ganadores}
              />
            ))}
            <Bloque
              titulo={data.retos.length > 0 ? 'Clasificación general' : 'Ganadores'}
              ganadores={data.general}
            />
          </>
        )}
      </div>
    </main>
  );
}
