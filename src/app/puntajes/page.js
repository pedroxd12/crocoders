'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { Trophy, Code, Globe, Award, RefreshCw, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from './page.module.css';
import LoadingSpinner from '@/components/LoadingSpinner';
import { fetcher } from '@/lib/fetcher';

const PLATFORMS = [
  {
    name: 'Codeforces',
    key: 'codeforces',
    icon: <Code size={18} />,
    columns: [
      { key: 'problemas_total', label: 'Problemas resueltos' },
      { key: 'problema_mas_dificil', label: 'Problema más difícil' },
      { key: 'rank_usuario', label: 'Rango' },
    ],
  },
  {
    name: 'VJudge',
    key: 'vjudge',
    icon: <Globe size={18} />,
    columns: [{ key: 'problemas_total', label: 'Problemas resueltos' }],
  },
  {
    name: 'OmegaUp',
    key: 'omegaup',
    icon: <Trophy size={18} />,
    columns: [{ key: 'problemas_total', label: 'Problemas resueltos' }],
  },
];

const formatoFecha = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Avatar con respaldo a iniciales. Antes la tarjeta sólo pintaba la foto cuando
 * el API la traía, así que las tarjetas cambiaban de alto y muchas quedaban sin
 * nada. Aquí siempre se reserva el mismo espacio y, si la imagen no carga
 * (Codeforces caído, gravatar inexistente), se muestran las iniciales.
 */
function Avatar({ src, iniciales, nombre }) {
  const [falló, setFalló] = useState(false);
  const mostrarImagen = Boolean(src) && !falló;

  return (
    <div className={styles.avatar}>
      {mostrarImagen ? (
        <Image
          src={src}
          alt={`Foto de perfil de ${nombre}`}
          fill
          sizes="96px"
          className={styles.avatarImg}
          onError={() => setFalló(true)}
          unoptimized
        />
      ) : (
        <span className={styles.avatarIniciales} aria-hidden="true">
          {iniciales}
        </span>
      )}
    </div>
  );
}

const Leaderboard = React.memo(function Leaderboard({ topPerformers }) {
  if (topPerformers.length === 0) return null;

  return (
    <div className={styles.leaderboardSection}>
      {/* El API devuelve totales históricos por plataforma, no cortes
          mensuales — el título debe reflejarlo para no ser inconsistente. */}
      <h2 className={styles.leaderboardTitle}>
        <Award className="text-yellow-500" />
        Top Competidores del Club
      </h2>
      <div className={styles.leaderboardGrid}>
        {topPerformers.map((miembro) => (
          <motion.div
            key={miembro.id_miembro}
            className={styles.leaderboardCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (miembro.posicion - 1) * 0.1 }}
          >
            <div className={`${styles.rankBadge} ${styles[`rank${miembro.posicion}`]}`}>
              {miembro.posicion}
            </div>

            <Avatar
              src={miembro.avatar}
              iniciales={miembro.iniciales}
              nombre={miembro.nombre_completo}
            />

            <h3 className={styles.memberName}>{miembro.nombre_completo}</h3>
            <p className={styles.totalSolved}>
              {miembro.total_problemas} problemas resueltos
            </p>

            <div className={styles.platformStats}>
              <div className={styles.statItem}>
                <span>CF</span>
                <span className={styles.statValue}>
                  {miembro.codeforces?.problemas_total ?? '—'}
                </span>
              </div>
              <div className={styles.statItem}>
                <span>VJ</span>
                <span className={styles.statValue}>
                  {miembro.vjudge?.problemas_total ?? '—'}
                </span>
              </div>
              <div className={styles.statItem}>
                <span>OU</span>
                <span className={styles.statValue}>
                  {miembro.omegaup?.problemas_total ?? '—'}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
});

/**
 * Posiciones con empates compartidos (1, 2, 2, 4). Antes el puesto era el
 * índice del arreglo, así que dos miembros con el mismo total salían en
 * posiciones distintas y podían intercambiarse entre recargas.
 */
function asignarPosiciones(lista, valorDe) {
  let posición = 0;
  let anterior = null;
  return lista.map((item, i) => {
    const valor = valorDe(item);
    if (valor !== anterior) {
      posición = i + 1;
      anterior = valor;
    }
    return { ...item, posicion: posición };
  });
}

const PuntajesPage = () => {
  const [activeTab, setActiveTab] = useState('Codeforces');
  const [refrescando, setRefrescando] = useState(false);

  // El endpoint responde desde la BD en milisegundos, así que no hace falta
  // ningún spinner largo ni reintentos escalonados. SWR guarda el resultado
  // entre navegaciones (igual que en /eventos y /evidencias) y revalida solo.
  const { data, error, isLoading, mutate } = useSWR('/api/puntajes', fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    // Mientras el servidor termina de sincronizar cuentas vencidas en segundo
    // plano, se revalida cada 10 s para ir mostrando los datos nuevos.
    refreshInterval: (actual) => (actual?.meta?.pendientes > 0 ? 10000 : 0),
  });

  const puntajes = useMemo(
    () => (Array.isArray(data?.resultados) ? data.resultados : []),
    [data],
  );
  const meta = data?.meta;

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    try {
      const res = await fetch('/api/puntajes', { method: 'POST' });
      if (res.ok) {
        await mutate(await res.json(), { revalidate: false });
      } else {
        await mutate();
      }
    } catch {
      await mutate();
    } finally {
      setRefrescando(false);
    }
  }, [mutate]);

  // El servidor ya envía `total_problemas` y el arreglo ordenado; la página se
  // limita a recortar el podio en vez de recalcular los totales por su cuenta
  // (antes había dos fuentes de verdad que podían discrepar).
  const topPerformers = useMemo(
    () =>
      asignarPosiciones(
        puntajes.filter((m) => m.total_problemas > 0).slice(0, 3),
        (m) => m.total_problemas,
      ),
    [puntajes],
  );

  const activePlatform = useMemo(
    () => PLATFORMS.find((p) => p.name === activeTab) ?? PLATFORMS[0],
    [activeTab],
  );

  const tableData = useMemo(() => {
    const key = activePlatform.key;
    const filas = puntajes
      .filter((m) => m[key])
      .sort(
        (a, b) =>
          b[key].problemas_total - a[key].problemas_total ||
          a.nombre_completo.localeCompare(b.nombre_completo, 'es'),
      );
    return asignarPosiciones(filas, (m) => m[key].problemas_total);
  }, [puntajes, activePlatform]);

  const celda = (info, columna) => {
    const valor = info[columna.key];
    // `valor || '—'` convertía un 0 legítimo en guion: quien no ha resuelto
    // nada debe verse como 0, no como "sin datos".
    if (typeof valor === 'number') return valor;
    if (!valor) return '—';
    if (columna.key === 'problema_mas_dificil' && info.max_dificultad > 0) {
      return (
        <>
          {valor} <span className={styles.dificultad}>{info.max_dificultad}</span>
        </>
      );
    }
    return valor;
  };

  const renderTable = () => {
    if (isLoading && puntajes.length === 0) {
      return (
        <div className={styles.loaderContainer}>
          <LoadingSpinner />
        </div>
      );
    }

    if (error && puntajes.length === 0) {
      return (
        <div className={styles.emptyState}>
          <div>No pudimos cargar la tabla de posiciones.</div>
          <button onClick={() => mutate()} className={styles.retryButton}>
            <RefreshCw size={16} /> Reintentar
          </button>
        </div>
      );
    }

    if (puntajes.length === 0) {
      return (
        <div className={styles.emptyState}>
          Aún no hay cuentas verificadas. Agrega tu usuario de Codeforces,
          VJudge u omegaUp desde tu perfil.
        </div>
      );
    }

    if (tableData.length === 0) {
      return (
        <div className={styles.emptyState}>
          Nadie tiene una cuenta de {activePlatform.name} registrada todavía.
        </div>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={styles.tableContainer}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Nombre</th>
              <th>Usuario</th>
              {activePlatform.columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map((miembro) => {
              const info = miembro[activePlatform.key];
              return (
                <tr key={miembro.id_miembro}>
                  <td className={styles.rankCell}>#{miembro.posicion}</td>
                  <td>{miembro.nombre_completo}</td>
                  <td>
                    <a
                      href={info.perfil_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.perfilLink}
                    >
                      {info.usuario}
                      <ExternalLink size={12} />
                    </a>
                  </td>
                  {activePlatform.columns.map((column) => (
                    <td key={column.key}>{celda(info, column)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </motion.div>
    );
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className={styles.headerRow}>
            <h1 className={styles.title}>Tabla de Posiciones</h1>
            <button
              onClick={refrescar}
              className={styles.refreshButton}
              disabled={refrescando}
              aria-label="Actualizar puntajes"
              title="Actualizar puntajes"
            >
              <RefreshCw size={18} className={refrescando ? styles.spinning : ''} />
            </button>
          </div>
          <p className={styles.description}>
            Ranking de problemas resueltos por los miembros del club en
            Codeforces, VJudge y OmegaUp. ¡Sigue practicando!
          </p>

          {/* Transparencia sobre la frescura de los datos: se sincronizan por
              turnos contra las plataformas y esto evita que un número viejo
              parezca un error. */}
          {meta?.actualizado_en && (
            <p className={styles.metaLinea}>
              Actualizado el {formatoFecha.format(new Date(meta.actualizado_en))}
              {(meta.pendientes > 0 || refrescando) && (
                <span className={styles.sincronizando}>
                  <RefreshCw size={12} className={styles.spinning} />
                  sincronizando{meta.pendientes > 0 ? ` ${meta.pendientes} cuentas` : ''}…
                </span>
              )}
            </p>
          )}
        </motion.div>

        <Leaderboard topPerformers={topPerformers} />

        <div className={styles.tabsContainer}>
          {PLATFORMS.map((platform) => (
            <button
              key={platform.name}
              onClick={() => setActiveTab(platform.name)}
              className={`${styles.tabButton} ${
                activeTab === platform.name ? styles.activeTab : ''
              }`}
            >
              {platform.icon}
              {platform.name}
            </button>
          ))}
        </div>

        {renderTable()}
      </div>
    </div>
  );
};

export default PuntajesPage;
