'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaCalendarAlt, FaUsers, FaClipboardCheck, FaQrcode } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function StaffDashboard() {
  const router = useRouter();
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMisEventos();
  }, []);

  const fetchMisEventos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/staff/eventos');
      if (!res.ok) {
        if (res.status === 401) {
          toast.error('Sesión expirada');
          router.push('/iniciar');
          return;
        }
        throw new Error('Error al cargar eventos');
      }
      const data = await res.json();
      setEventos(data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getEventoEstado = (evento) => {
    const ahora = new Date();
    const fechaInicio = new Date(`${evento.fecha_inicio}T${evento.hora_inicio || '00:00:00'}`);
    const fechaFin = new Date(`${evento.fecha_fin}T${evento.hora_fin || '23:59:59'}`);

    if (ahora < fechaInicio) return { label: 'Próximo', color: 'bg-blue-600' };
    if (ahora >= fechaInicio && ahora <= fechaFin) return { label: 'En Curso', color: 'bg-green-600' };
    return { label: 'Finalizado', color: 'bg-gray-600' };
  };

  if (loading) return <LoadingSpinner />;

  const eventosProximos = eventos.filter(e => {
    const fechaInicio = new Date(`${e.fecha_inicio}T${e.hora_inicio || '00:00:00'}`);
    return fechaInicio > new Date();
  });

  const eventosEnCurso = eventos.filter(e => {
    const ahora = new Date();
    const fechaInicio = new Date(`${e.fecha_inicio}T${e.hora_inicio || '00:00:00'}`);
    const fechaFin = new Date(`${e.fecha_fin}T${e.hora_fin || '23:59:59'}`);
    return ahora >= fechaInicio && ahora <= fechaFin;
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Panel de Staff</h1>
        <p className="text-gray-400">Gestiona los eventos donde participas como staff</p>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Eventos</p>
              <p className="text-3xl font-bold text-white mt-1">{eventos.length}</p>
            </div>
            <div className="bg-blue-600 p-4 rounded-lg">
              <FaCalendarAlt className="text-white text-2xl" />
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">En Curso</p>
              <p className="text-3xl font-bold text-green-400 mt-1">{eventosEnCurso.length}</p>
            </div>
            <div className="bg-green-600 p-4 rounded-lg">
              <FaClipboardCheck className="text-white text-2xl" />
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Próximos</p>
              <p className="text-3xl font-bold text-blue-400 mt-1">{eventosProximos.length}</p>
            </div>
            <div className="bg-purple-600 p-4 rounded-lg">
              <FaUsers className="text-white text-2xl" />
            </div>
          </div>
        </div>
      </div>

      {/* Eventos En Curso */}
      {eventosEnCurso.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
            Eventos en Curso
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {eventosEnCurso.map(evento => (
              <EventoCard key={evento.id_evento} evento={evento} estado={getEventoEstado(evento)} router={router} />
            ))}
          </div>
        </div>
      )}

      {/* Todos los Eventos */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Mis Eventos</h2>
        {eventos.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400">No estás asignado como staff a ningún evento aún.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {eventos.map(evento => (
              <EventoCard key={evento.id_evento} evento={evento} estado={getEventoEstado(evento)} router={router} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventoCard({ evento, estado, router }) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden hover:shadow-lg transition-shadow border border-gray-700">
      {evento.imagen_url && (
        <div 
          className="h-32 bg-cover bg-center" 
          style={{ backgroundImage: `url(${evento.imagen_url})` }}
        />
      )}
      
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-bold text-white">{evento.nombre}</h3>
          <span className={`px-2 py-1 rounded text-xs ${estado.color} text-white`}>
            {estado.label}
          </span>
        </div>

        <div className="space-y-2 text-sm text-gray-400 mb-4">
          <p className="flex items-center gap-2">
            <FaCalendarAlt className="text-green-400" />
            {new Date(evento.fecha_inicio).toLocaleDateString()}
          </p>
          <p>
            <span className="font-semibold text-green-400">Mi Rol:</span> {evento.mi_rol}
          </p>
          <div className="flex gap-4">
            <span><span className="font-semibold">Inscritos:</span> {evento.total_inscritos}</span>
            <span><span className="font-semibold">Asistieron:</span> {evento.total_asistieron}</span>
          </div>
        </div>

        <Button
          onClick={() => router.push(`/staff/eventos/${evento.id_evento}`)}
          variant="primary"
          className="w-full"
        >
          Ver Detalles
        </Button>
      </div>
    </div>
  );
}
