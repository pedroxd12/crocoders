'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaUser, FaEnvelope, FaPhone, FaTrash, FaArrowLeft, FaUsers } from 'react-icons/fa';
import Table from '@/components/ui/Table';
import LoadingSpinner from '@/components/LoadingSpinner';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function AsistentesAdmin() {
  const router = useRouter();
  const params = useParams();
  const [asistentes, setAsistentes] = useState({ miembros: [], invitados: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [eventoInfo, setEventoInfo] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { id } = params;

  useEffect(() => {
    if (id) {
      fetchAsistentes();
      fetchEventoInfo();
    }
  }, [id]);

  const fetchEventoInfo = async () => {
    try {
      const res = await fetch(`/api/admin/eventos/${id}`);
      if (!res.ok) throw new Error('Error al cargar información del evento');
      const data = await res.json();
      setEventoInfo(data);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const fetchAsistentes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/eventos/${id}/asistentes`);
      if (!res.ok) throw new Error('Error al cargar asistentes');
      const data = await res.json();
      setAsistentes(data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEliminarAsistente = async (idAsistente, esMiembro = true) => {
    if (!confirm('¿Estás seguro de eliminar este asistente?')) return;
    
    try {
      const res = await fetch(
        `/api/admin/eventos/${id}/asistentes`, 
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            id_asistente: idAsistente,
            es_miembro: esMiembro 
          })
        }
      );
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al eliminar asistente');
      }
      
      toast.success('Asistente eliminado correctamente');
      await fetchAsistentes();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const filteredMiembros = asistentes.miembros?.filter(miembro =>
    miembro.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    miembro.correo_electronico.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredInvitados = asistentes.invitados?.filter(invitado =>
    invitado.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invitado.correo_electronico.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FaUsers /> Asistentes al evento
          </h2>
          <p className="text-gray-400">
            {eventoInfo?.nombre_evento || 'Evento'} - 
            Fecha: {eventoInfo?.fecha ? new Date(eventoInfo.fecha).toLocaleDateString('es-ES') : ''}
          </p>
        </div>
        <Button 
          onClick={() => router.push('/admin/eventos')} 
          variant="secondary"
          icon={<FaArrowLeft />}
        >
          Volver a Eventos
        </Button>
      </div>

      <div className="mb-6">
        <Input
          type="text"
          placeholder="Buscar asistentes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-1/2"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-white">Miembros ({asistentes.miembros?.length || 0})</h3>
          </div>
          
          {filteredMiembros?.length > 0 ? (
            <div className="overflow-x-auto">
              <Table
                columns={[
                  { 
                    header: 'Nombre', 
                    accessor: 'nombre_completo',
                    cellClassName: 'font-medium'
                  },
                  { 
                    header: 'Correo', 
                    accessor: 'correo_electronico',
                    cellClassName: 'text-gray-400 text-sm'
                  },
                  {
                    header: 'Asistencia',
                    render: (miembro) => (
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        miembro.asistio ? 'bg-green-600' : 'bg-red-600'
                      }`}>
                        {miembro.asistio ? 'Asistió' : 'No asistió'}
                      </span>
                    )
                  },
                  {
                    header: 'Acciones',
                    render: (miembro) => (
                      <Button
                        onClick={() => handleEliminarAsistente(miembro.id_miembro, true)}
                        variant="text"
                        size="sm"
                        icon={<FaTrash />}
                        className="text-red-400 hover:text-red-300"
                      />
                    ),
                    cellClassName: 'text-right'
                  }
                ]}
                data={filteredMiembros}
                emptyMessage="No hay miembros registrados en este evento"
                className="w-full"
                headerClassName="bg-gray-700 text-gray-300"
                rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
              />
            </div>
          ) : (
            <p className="text-gray-400 py-4 text-center">No hay miembros registrados en este evento</p>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-white">Invitados ({asistentes.invitados?.length || 0})</h3>
          </div>
          
          {filteredInvitados?.length > 0 ? (
            <div className="overflow-x-auto">
              <Table
                columns={[
                  { 
                    header: 'Nombre', 
                    accessor: 'nombre_completo',
                    cellClassName: 'font-medium'
                  },
                  { 
                    header: 'Correo', 
                    accessor: 'correo_electronico',
                    cellClassName: 'text-gray-400 text-sm'
                  },
                  {
                    header: 'Asistencia',
                    render: (invitado) => (
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        invitado.asistio ? 'bg-green-600' : 'bg-red-600'
                      }`}>
                        {invitado.asistio ? 'Asistió' : 'No asistió'}
                      </span>
                    )
                  },
                  {
                    header: 'Acciones',
                    render: (invitado) => (
                      <Button
                        onClick={() => handleEliminarAsistente(invitado.id_invitado, false)}
                        variant="text"
                        size="sm"
                        icon={<FaTrash />}
                        className="text-red-400 hover:text-red-300"
                      />
                    ),
                    cellClassName: 'text-right'
                  }
                ]}
                data={filteredInvitados}
                emptyMessage="No hay invitados registrados en este evento"
                className="w-full"
                headerClassName="bg-gray-700 text-gray-300"
                rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
              />
            </div>
          ) : (
            <p className="text-gray-400 py-4 text-center">No hay invitados registrados en este evento</p>
          )}
        </div>
      </div>
    </div>
  );
}