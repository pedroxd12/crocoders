
'use client';

import { useState, useEffect } from 'react';
import { 
  Users, 
  Calendar, 
  DollarSign, 
  Activity,
  UserCheck,
  Clock
} from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';

const StatCard = ({ title, value, icon: Icon, color }) => (
  <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-lg ${color} bg-opacity-20`}>
        <Icon className={`w-8 h-8 ${color.replace('bg-', 'text-')}`} />
      </div>
      <span className="text-2xl font-bold text-white">{value}</span>
    </div>
    <h3 className="text-gray-400 font-medium">{title}</h3>
  </div>
);

export default function DashboardHome() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!stats) return <div className="text-white text-center">No se pudieron cargar las estadísticas.</div>;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Miembros Activos" 
          value={stats.activeMembers} 
          icon={Users} 
          color="bg-blue-500 text-blue-500" 
        />
        <StatCard 
          title="Eventos Realizados" 
          value={stats.totalEvents} 
          icon={Calendar} 
          color="bg-purple-500 text-purple-500" 
        />
        <StatCard 
          title="Total Recaudado" 
          value={`$${stats.totalRevenue.toFixed(2)}`} 
          icon={DollarSign} 
          color="bg-green-500 text-green-500" 
        />
        <StatCard 
          title="Inscripciones (Recientes)" 
          value={stats.recentInscriptions.length} 
          icon={Activity} 
          color="bg-orange-500 text-orange-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Inscriptions */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Clock size={20} className="text-gray-400" />
            Inscripciones Recientes
          </h3>
          <div className="space-y-4">
            {stats.recentInscriptions.length > 0 ? stats.recentInscriptions.map((ins, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-white">{ins.usuario}</p>
                  <p className="text-sm text-gray-400">{ins.evento}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    ins.estado === 'confirmada' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {ins.estado}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(ins.fecha_inscripcion).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-gray-400 text-center py-4">No hay inscripciones recientes</p>
            )}
          </div>
        </div>

        {/* Event Stats */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <UserCheck size={20} className="text-gray-400" />
            Resumen de Eventos
          </h3>
          <div className="space-y-4">
            {stats.eventStats.map((evt) => (
              <div key={evt.id_evento} className="p-4 bg-gray-700/50 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-white">{evt.nombre}</h4>
                  <span className="text-xs text-gray-400">{new Date(evt.fecha_inicio).toLocaleDateString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="bg-gray-800 rounded p-2 text-center">
                    <span className="block text-xl font-bold text-blue-400">{evt.registrados}</span>
                    <span className="text-xs text-gray-500">Registrados</span>
                  </div>
                  <div className="bg-gray-800 rounded p-2 text-center">
                    <span className="block text-xl font-bold text-green-400">{evt.asistentes}</span>
                    <span className="text-xs text-gray-500">Asistieron</span>
                  </div>
                </div>
                <div className="mt-2 w-full bg-gray-600 rounded-full h-1.5">
                  <div 
                    className="bg-green-500 h-1.5 rounded-full" 
                    style={{ width: `${evt.registrados > 0 ? (evt.asistentes / evt.registrados) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            ))}
            {stats.eventStats.length === 0 && (
                <p className="text-gray-400 text-center py-4">No hay eventos recientes</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
