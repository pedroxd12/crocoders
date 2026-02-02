'use client';

import React, { useState, useEffect } from "react";
import { Trophy, Code, Globe, Award, Loader } from "lucide-react";
import { motion } from "framer-motion";
import styles from "./page.module.css";
import LoadingSpinner from "@/components/LoadingSpinner";

// Componente Leaderboard definido fuera
const Leaderboard = ({ topPerformers, loading }) => {
  if (!loading && topPerformers.length === 0) return null;

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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={miembro.codeforces.avatar} 
                      alt={`Avatar de ${miembro.nombre_completo}`}
                      className="w-full h-full object-cover"
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
};

const PuntajesPage = () => {
  const [puntajes, setPuntajes] = useState([]);
  const [mesActual, setMesActual] = useState("");
  const [activeTab, setActiveTab] = useState("Codeforces");
  const [topPerformers, setTopPerformers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Obtener el mes actual
    const meses = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    const mes = new Date().getMonth();
    setMesActual(meses[mes]);

    // Obtener los puntajes desde la API
    const fetchPuntajes = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/puntajes");
        
        if (!res.ok) {
          if (res.status === 404) {
            setPuntajes([]);
            setLoading(false);
            return;
          }
          throw new Error('Error al obtener puntajes');
        }

        const data = await res.json();
        const resultados = data.resultados || []; // Fallback if data.resultados is undefined

        // Mapear los datos de la API a la estructura esperada
        const miembrosConPuntajes = resultados.map(miembro => {
          return {
            id_miembro: miembro.id_miembro,
            nombre_completo: miembro.nombre_completo,
            codeforces: miembro.codeforces,
            vjudge: miembro.vjudge,
            omegaup: miembro.omegaup
          };
        }).filter(miembro => 
          miembro.codeforces || miembro.vjudge || miembro.omegaup
        );

        setPuntajes(miembrosConPuntajes);

        // Calcular top performers
        const performersWithTotalSolved = miembrosConPuntajes
          .map(miembro => {
            const totalSolved = 
              (miembro.codeforces?.problemas_total || 0) +
              (miembro.vjudge?.problemas_total || 0) +
              (miembro.omegaup?.problemas_total || 0);
            
            return {
              ...miembro,
              totalSolved
            };
          })
          .filter(miembro => miembro.totalSolved > 0)
          .sort((a, b) => b.totalSolved - a.totalSolved)
          .slice(0, 3);

        setTopPerformers(performersWithTotalSolved);
      } catch (err) {
        console.error("Error al obtener puntajes:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPuntajes();
  }, []);

  // Configuración de plataformas
  const platforms = [
    {
      name: "Codeforces",
      icon: <Code size={18} />,
      columns: [
        { key: "problemas_total", label: "Problemas Resueltos" },
        { key: "problema_mas_dificil", label: "Problema Más Difícil" }
      ]
    },
    {
      name: "VJudge",
      icon: <Globe size={18} />,
      columns: [
        { key: "problemas_total", label: "Problemas Totales" }
      ]
    },
    {
      name: "OmegaUp",
      icon: <Trophy size={18} />,
      columns: [
        { key: "problemas_total", label: "Problemas Totales" }
      ]
    }
  ];

  const renderTable = (platformData) => {
    if (loading) {
        return (
            <div className={styles.loaderContainer}>
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (error) {
      return (
        <div className={styles.emptyState}>
          Error: {error}
        </div>
      );
    }

    if (puntajes.length === 0) {
      return (
        <div className={styles.emptyState}>
          No hay competidores registrados aún.
        </div>
      );
    }

    const activePlatform = platforms.find(p => p.name === platformData.name);
    const platformKey = platformData.name.toLowerCase();
    
    // Sort logic for table could be added here, currently default order
    const tableData = puntajes
        .filter(miembro => miembro[platformKey])
        .sort((a, b) => (b[platformKey]?.problemas_total || 0) - (a[platformKey]?.problemas_total || 0));

    if (tableData.length === 0) {
        return (
            <div className={styles.emptyState}>
                No hay datos para {platformData.name} en este momento.
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
                  const platformInfo = miembro[platformKey];
                  return (
                    <tr key={miembro.id_miembro}>
                      <td className={styles.rankCell}>#{index + 1}</td>
                      <td>{miembro.nombre_completo}</td>
                      <td className="font-mono text-sm text-gray-400">{platformInfo.usuario}</td>
                      {activePlatform.columns.map((column) => (
                        <td key={column.key}>
                          {platformInfo[column.key] || '-'}
                        </td>
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
            <h1 className={styles.title}>Tabla de Posiciones</h1>
            <p className={styles.description}>
                Ranking mensual de resolución de problemas en {mesActual}. ¡Sigue practicando!
            </p>
        </motion.div>

        {!loading && topPerformers.length > 0 && <Leaderboard topPerformers={topPerformers} loading={loading} />}

        <div className={styles.tabsContainer}>
          {platforms.map((platform) => (
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

        {renderTable(platforms.find(p => p.name === activeTab))}
      </div>
    </div>
  );
}

export default PuntajesPage;