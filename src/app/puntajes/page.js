'use client';

import React, { useState, useEffect } from "react";
import { Trophy, Code, Globe, Star, Award } from "lucide-react";

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
        
        if (!data.resultados) {
          throw new Error('Formato de datos incorrecto');
        }

        // Mapear los datos de la API a la estructura esperada
        const miembrosConPuntajes = data.resultados.map(miembro => {
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
      icon: <Code className="w-6 h-6 mr-2" />,
      columns: [
        { key: "problemas_total", label: "Problemas Resueltos" },
        { key: "problema_mas_dificil", label: "Problema Más Difícil" }
      ]
    },
    {
      name: "VJudge",
      icon: <Globe className="w-6 h-6 mr-2" />,
      columns: [
        { key: "problemas_semana", label: "Problemas en la semana" },
        { key: "problemas_total", label: "Problemas Totales" }
      ]
    },
    {
      name: "OmegaUp",
      icon: <Trophy className="w-6 h-6 mr-2" />,
      columns: [
        { key: "problemas_semana", label: "Problemas en la semana" },
        { key: "problemas_total", label: "Problemas Totales" }
      ]
    }
  ];

  const renderTable = (platformData) => {
    if (loading) {
      return (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Cargando datos...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-red-400">
          Error: {error}
        </div>
      );
    }

    if (puntajes.length === 0) {
      return (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-yellow-400">
          No hay miembros con datos disponibles
        </div>
      );
    }

    const activePlatform = platforms.find(p => p.name === platformData.name);
    const platformKey = platformData.name.toLowerCase();
    
    return (
      <div className="bg-gray-800 rounded-lg shadow-2xl overflow-hidden">
        <div className="bg-gray-700 p-4 flex items-center justify-center">
          {activePlatform.icon}
          <h2 className="text-2xl font-bold">{platformData.name}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-white">
            <thead className="bg-gray-900">
              <tr>
                <th className="p-3 pl-6">No.</th>
                <th className="p-3">Nombre Completo</th>
                <th className="p-3">Usuario</th>
                {activePlatform.columns.map((column) => (
                  <th key={column.key} className="p-3">{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {puntajes
                .filter(miembro => miembro[platformKey])
                .map((miembro, index) => {
                  const platformInfo = miembro[platformKey];
                  return (
                    <tr 
                      key={miembro.id_miembro} 
                      className="border-b border-gray-700 hover:bg-gray-700 transition-colors"
                    >
                      <td className="p-3 pl-6 font-semibold">{index + 1}</td>
                      <td className="p-3">{miembro.nombre_completo}</td>
                      <td className="p-3">{platformInfo.usuario}</td>
                      {activePlatform.columns.map((column) => (
                        <td key={column.key} className="p-3">
                          {platformInfo[column.key] || 'N/A'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Componente Leaderboard
  const Leaderboard = () => {
    if (topPerformers.length === 0) {
      return (
        <div className="mb-12 bg-gray-800 rounded-xl shadow-2xl p-6 text-center text-yellow-400">
          No hay suficientes datos para mostrar el top de competidores
        </div>
      );
    }

    const podiumStyles = [
      "bg-yellow-500/20 border-yellow-500",
      "bg-gray-400/20 border-gray-400",
      "bg-orange-500/20 border-orange-500"
    ];

    return (
      <div className="mb-12 bg-gray-800 rounded-xl shadow-2xl p-6">
        <div className="flex items-center justify-center mb-6">
          <Award className="w-8 h-8 mr-3 text-yellow-400" />
          <h2 className="text-3xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-500">
            Top 3 Mejores Competidores
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {topPerformers.map((miembro, index) => (
            <div 
              key={miembro.id_miembro} 
              className={`
                rounded-lg p-4 border-2 transform transition-all duration-300 
                hover:scale-105 hover:shadow-2xl text-center
                ${podiumStyles[index]}
              `}
            >
              <div className="flex justify-center mb-4">
                <div className={`
                  w-16 h-16 rounded-full flex items-center justify-center 
                  text-3xl font-bold text-white
                  ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-500' : 'bg-orange-500'}
                `}>
                  {index + 1}
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-2">{miembro.nombre_completo}</h3>
              <div className="space-y-2 text-gray-300">
                <p className="text-lg font-bold">Total: {miembro.totalSolved}</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="bg-blue-900/50 p-1 rounded">CF: {miembro.codeforces?.problemas_total || 0}</span>
                  <span className="bg-green-900/50 p-1 rounded">VJ: {miembro.vjudge?.problemas_total || 0}</span>
                  <span className="bg-purple-900/50 p-1 rounded">OU: {miembro.omegaup?.problemas_total || 0}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
            Puntajes de Competencias
          </h1>
          <p className="text-xl text-gray-400">{mesActual}</p>
        </div>

        <Leaderboard />

        <div className="flex flex-wrap justify-center mb-8 gap-2">
          {platforms.map((platform) => (
            <button
              key={platform.name}
              onClick={() => setActiveTab(platform.name)}
              className={`
                flex items-center px-4 py-2 rounded-lg transition-all duration-300
                ${activeTab === platform.name 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}
              `}
            >
              {platform.icon}
              {platform.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-8">
          {renderTable(platforms.find(p => p.name === activeTab))}
        </div>
      </div>
    </div>
  );
}

export default PuntajesPage;