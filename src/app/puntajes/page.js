'use client';

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { Trophy, Code, Globe, Award, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import styles from "./page.module.css";
import LoadingSpinner from "@/components/LoadingSpinner";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const PLATFORMS = [
  {
    name: "Codeforces",
    key: "codeforces",
    icon: <Code size={18} />,
    columns: [
      { key: "problemas_total", label: "Problemas Resueltos" },
      { key: "problema_mas_dificil", label: "Problema Más Difícil" },
    ],
  },
  {
    name: "VJudge",
    key: "vjudge",
    icon: <Globe size={18} />,
    columns: [{ key: "problemas_total", label: "Problemas Totales" }],
  },
  {
    name: "OmegaUp",
    key: "omegaup",
    icon: <Trophy size={18} />,
    columns: [{ key: "problemas_total", label: "Problemas Totales" }],
  },
];

const Leaderboard = React.memo(function Leaderboard({ topPerformers }) {
  if (topPerformers.length === 0) return null;

  return (
    <div className={styles.leaderboardSection}>
      <h2 className={styles.leaderboardTitle}>
        <Award className="text-yellow-500" />
        Top Competidores del Mes
      </h2>
      <div className={styles.leaderboardGrid}>
        {topPerformers.map((miembro, index) => (
          <motion.div
            key={miembro.id_miembro}
            className={styles.leaderboardCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className={`${styles.rankBadge} ${styles[`rank${index + 1}`]}`}>
              {index + 1}
            </div>

            {miembro.codeforces?.avatar && (
              <div className="flex justify-center mb-4">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/10 shadow-lg relative">
                  <Image
                    src={miembro.codeforces.avatar}
                    alt={`Avatar de ${miembro.nombre_completo}`}
                    fill
                    sizes="96px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              </div>
            )}

            <h3 className={styles.memberName}>{miembro.nombre_completo}</h3>
            <p className={styles.totalSolved}>{miembro.totalSolved} problemas resueltos</p>

            <div className={styles.platformStats}>
              <div className={styles.statItem}>
                <span>CF</span>
                <span className={styles.statValue}>{miembro.codeforces?.problemas_total || 0}</span>
              </div>
              <div className={styles.statItem}>
                <span>VJ</span>
                <span className={styles.statValue}>{miembro.vjudge?.problemas_total || 0}</span>
              </div>
              <div className={styles.statItem}>
                <span>OU</span>
                <span className={styles.statValue}>{miembro.omegaup?.problemas_total || 0}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
});

const PuntajesPage = () => {
  const [puntajes, setPuntajes] = useState([]);
  const [activeTab, setActiveTab] = useState("Codeforces");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const mesActual = useMemo(() => MESES[new Date().getMonth()], []);

  const fetchPuntajes = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch("/api/puntajes", { signal: controller.signal });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({ resultados: [] }));
      const resultados = Array.isArray(data?.resultados) ? data.resultados : [];

      const miembros = resultados.filter(
        (m) => m && (m.codeforces || m.vjudge || m.omegaup),
      );

      setPuntajes(miembros);

      if (data?.error && miembros.length === 0) {
        setError("No pudimos obtener los puntajes en este momento.");
      }
    } catch (err) {
      console.error("Error al obtener puntajes:", err);
      setError(
        err.name === "AbortError"
          ? "La solicitud tardó demasiado. Intenta nuevamente."
          : "No pudimos conectar con el servidor.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPuntajes();
  }, [fetchPuntajes]);

  const topPerformers = useMemo(() => {
    return puntajes
      .map((m) => ({
        ...m,
        totalSolved:
          (m.codeforces?.problemas_total || 0) +
          (m.vjudge?.problemas_total || 0) +
          (m.omegaup?.problemas_total || 0),
      }))
      .filter((m) => m.totalSolved > 0)
      .sort((a, b) => b.totalSolved - a.totalSolved)
      .slice(0, 3);
  }, [puntajes]);

  const activePlatform = useMemo(
    () => PLATFORMS.find((p) => p.name === activeTab),
    [activeTab],
  );

  const tableData = useMemo(() => {
    if (!activePlatform) return [];
    const key = activePlatform.key;
    return puntajes
      .filter((m) => m[key])
      .sort(
        (a, b) =>
          (b[key]?.problemas_total || 0) - (a[key]?.problemas_total || 0),
      );
  }, [puntajes, activePlatform]);

  const renderTable = () => {
    if (loading) {
      return (
        <div className={styles.loaderContainer}>
          <LoadingSpinner />
        </div>
      );
    }

    if (error && puntajes.length === 0) {
      return (
        <div className={styles.emptyState}>
          <div>{error}</div>
          <button
            onClick={() => fetchPuntajes()}
            className={styles.retryButton}
          >
            <RefreshCw size={16} /> Reintentar
          </button>
        </div>
      );
    }

    if (puntajes.length === 0) {
      return <div className={styles.emptyState}>No hay competidores registrados aún.</div>;
    }

    if (tableData.length === 0) {
      return (
        <div className={styles.emptyState}>
          No hay datos para {activePlatform.name} en este momento.
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
              <th>Rank</th>
              <th>Nombre</th>
              <th>Usuario</th>
              {activePlatform.columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map((miembro, index) => {
              const platformInfo = miembro[activePlatform.key];
              return (
                <tr key={miembro.id_miembro}>
                  <td className={styles.rankCell}>#{index + 1}</td>
                  <td>{miembro.nombre_completo}</td>
                  <td className="font-mono text-sm text-gray-400">{platformInfo.usuario}</td>
                  {activePlatform.columns.map((column) => (
                    <td key={column.key}>{platformInfo[column.key] || '-'}</td>
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
              onClick={() => fetchPuntajes({ silent: true })}
              className={styles.refreshButton}
              disabled={loading || refreshing}
              aria-label="Refrescar puntajes"
            >
              <RefreshCw size={18} className={refreshing ? styles.spinning : ''} />
            </button>
          </div>
          <p className={styles.description}>
            Ranking mensual de resolución de problemas en {mesActual}. ¡Sigue practicando!
          </p>
        </motion.div>

        {!loading && <Leaderboard topPerformers={topPerformers} />}

        <div className={styles.tabsContainer}>
          {PLATFORMS.map((platform) => (
            <button
              key={platform.name}
              onClick={() => setActiveTab(platform.name)}
              className={`${styles.tabButton} ${activeTab === platform.name ? styles.activeTab : ''}`}
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
