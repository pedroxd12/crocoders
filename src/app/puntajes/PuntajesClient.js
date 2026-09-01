'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { Trophy, Code, Globe, Award, RefreshCw, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from './page.module.css';
import LoadingSpinner from '@/components/LoadingSpinner';
import { fetcher } from '@/lib/fetcher';
import { useAuth } from '@/context/AuthContext';
import { APP_ROLES } from '@/lib/roles';
import { ZONA_EVENTOS } from '@/lib/eventos-fechas';

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

// Reintentos del lado del cliente mientras el API no responde (ver onErrorRetry).
const MS_ENTRE_REINTENTOS = 3000;
const REINTENTOS_MAXIMOS = 10;

// `timeZone` explícito y NO la del entorno. Sin fijarla, el servidor formatea
// esta fecha en UTC y el navegador en la zona del visitante: el mismo instante
// produce dos textos distintos y React lo reporta como desajuste de hidratación
// al renderizar la página en servidor. Fijarla es además lo correcto: la hora
// que le interesa al club es la suya, no la de quien mira desde otro huso.
const formatoFecha = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ZONA_EVENTOS,
});

/**
 * Texto de la insignia de sincronización.
 *
 * `meta.pendientes` cuenta PERFILES de plataforma, no personas: cada miembro
 * puede tener uno de Codeforces, otro de VJudge y otro de omegaUp, así que con
 * 20 miembros la insignia llegaba a decir "sincronizando 53 cuentas" — una
 * cifra correcta pero que no corresponde a nada que el club reconozca. Se
 * muestran miembros y el desglose por perfil queda en el tooltip.
 */
function textoSincronizando(meta) {
  const miembros = meta?.miembros_pendientes;
  if (!miembros) return 'sincronizando…';
  return `sincronizando ${miembros} ${miembros === 1 ? 'miembro' : 'miembros'}…`;
}

function detalleSincronizando(meta) {
  const perfiles = meta?.pendientes;
  if (!perfiles) return undefined;
  return `${perfiles} ${perfiles === 1 ? 'perfil' : 'perfiles'} por actualizar en Codeforces, VJudge u omegaUp`;
}

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
        <Award className="text-warning" />
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

// `datosIniciales` es la respuesta que el Server Component de page.js leyó
// directamente de la base y mandó dentro del HTML. Va a SWR como `fallbackData`,
// así que la tabla se pinta con datos frescos en el primer render y SIN pasar
// por la caché de la CDN, que era justo lo que hacía ver números viejos.
const PuntajesClient = ({ datosIniciales }) => {
  const [activeTab, setActiveTab] = useState('Codeforces');
  const [refrescando, setRefrescando] = useState(false);
  const [avisoRefresco, setAvisoRefresco] = useState(null);
  // El refresco manual golpea las APIs de Codeforces/VJudge/omegaUp, así que el
  // endpoint ahora exige sesión: a quien no la tiene no se le enseña un botón
  // que sólo le devolvería un 401. La página en sí sigue siendo pública y se
  // actualiza sola (el GET lanza la sincronización de fondo).
  const { user } = useAuth();
  const puedeRefrescar = Boolean(user);
  const esAdmin = user?.role === APP_ROLES.ADMIN;

  // El endpoint responde desde la BD en milisegundos, así que no hace falta
  // ningún spinner largo ni reintentos escalonados. SWR guarda el resultado
  // entre navegaciones (igual que en /eventos y /evidencias) y revalida solo.
  const { data, error, isLoading, mutate } = useSWR('/api/puntajes', fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    fallbackData: datosIniciales,
    // Lo que llegó con el HTML se acaba de leer de la base; volver a pedirlo al
    // montar sólo traería la copia (posiblemente más vieja) de la CDN. Si el
    // servidor no pudo leer, `datosIniciales` es undefined y SWR recupera su
    // carga normal.
    revalidateOnMount: datosIniciales === undefined,
    // Mientras el servidor termina de sincronizar cuentas vencidas en segundo
    // plano, se revalida cada 10 s para ir mostrando los datos nuevos.
    refreshInterval: (actual) => (actual?.meta?.pendientes > 0 ? 10000 : 0),
    // La base de datos (Railway) se duerme, así que la primera petición tras un
    // rato de silencio puede responder 503 mientras arranca. Con el backoff
    // exponencial que trae SWR de fábrica el siguiente intento llegaba decenas
    // de segundos después y la tabla se quedaba vacía hasta que alguien
    // recargaba a mano; aquí se reintenta a ritmo fijo hasta que responda.
    onErrorRetry: (_error, _clave, _config, revalidar, { retryCount }) => {
      if (retryCount >= REINTENTOS_MAXIMOS) return;
      setTimeout(() => revalidar({ retryCount }), MS_ENTRE_REINTENTOS);
    },
  });

  const puntajes = useMemo(
    () => (Array.isArray(data?.resultados) ? data.resultados : []),
    [data],
  );
  const meta = data?.meta;

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    setAvisoRefresco(null);
    try {
      // `forzar=1` salta el TTL y vuelve a consultar TODAS las cuentas: el
      // endpoint sólo se lo permite a administración, así que el resto pide el
      // refresco normal (las cuentas vencidas) en vez de comerse un 403.
      const res = await fetch(`/api/puntajes${esAdmin ? '?forzar=1' : ''}`, { method: 'POST' });
      if (res.ok) {
        const datos = await res.json();
        if (datos?.meta?.reutilizada) {
          setAvisoRefresco('Ya había una actualización en curso; se mostrarán los datos en cuanto termine.');
        }
        await mutate(datos, { revalidate: false });
      } else if (res.status === 429) {
        setAvisoRefresco('Has pedido demasiadas actualizaciones seguidas. Espera unos minutos.');
        await mutate();
      } else if (res.status === 401 || res.status === 403) {
        setAvisoRefresco('Tu sesión expiró. Vuelve a iniciar sesión para actualizar.');
        await mutate();
      } else {
        setAvisoRefresco('No se pudo lanzar la actualización. Inténtalo de nuevo en un momento.');
        await mutate();
      }
    } catch {
      setAvisoRefresco('No se pudo lanzar la actualización. Inténtalo de nuevo en un momento.');
      await mutate();
    } finally {
      setRefrescando(false);
    }
  }, [mutate, esAdmin]);

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
          <div>
            {error.status === 503
              ? 'La base de datos está despertando; esto tarda unos segundos.'
              : 'No pudimos cargar la tabla de posiciones.'}
          </div>
          <div className={styles.reintentando}>
            <RefreshCw size={14} className={styles.spinning} />
            Reintentando solo…
          </div>
          <button onClick={() => mutate()} className={styles.retryButton}>
            <RefreshCw size={16} /> Reintentar ahora
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
            {puedeRefrescar && (
              <button
                onClick={refrescar}
                className={styles.refreshButton}
                disabled={refrescando}
                aria-label="Actualizar puntajes"
                title="Actualizar puntajes"
              >
                <RefreshCw size={18} className={refrescando ? styles.spinning : ''} />
              </button>
            )}
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
                <span className={styles.sincronizando} title={detalleSincronizando(meta)}>
                  <RefreshCw size={12} className={styles.spinning} />
                  {textoSincronizando(meta)}
                </span>
              )}
            </p>
          )}

          {/* El resultado del botón se dice con palabras: antes un 429 o un
              lote ya en curso se veían igual que un refresco exitoso. */}
          {avisoRefresco && (
            <p className={styles.metaLinea} role="status">
              {avisoRefresco}
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

export default PuntajesClient;
