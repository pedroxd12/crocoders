'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { 
  FaUser, 
  FaEnvelope, 
  FaTrash, 
  FaArrowLeft, 
  FaUsers, 
  FaCheck, 
  FaTimes,
  FaSearch,
  FaCalendarAlt,
  FaGraduationCap,
  FaBook,
  FaUserTie,
  FaUserFriends
} from 'react-icons/fa';
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
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
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
      
      setAsistentes({
        miembros: data.miembros || [],
        invitados: data.invitados || []
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirmation = (idAsistente, esMiembro, nombre) => {
    setDeleteConfirmation({
      idAsistente,
      esMiembro,
      nombre
    });
  };

  const handleEliminarAsistente = async (idAsistente, esMiembro = true) => {
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
      setDeleteConfirmation(null);
      await fetchAsistentes();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleToggleAsistencia = async (idAsistente, esMiembro, asistioActual) => {
    try {
      const res = await fetch(
        `/api/admin/eventos/${id}/asistencia`, 
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            id_asistente: idAsistente,
            es_miembro: esMiembro,
            asistio: !asistioActual
          })
        }
      );
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al actualizar asistencia');
      }
      
      toast.success('Asistencia actualizada correctamente');
      await fetchAsistentes();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const filteredMiembros = asistentes.miembros.filter(miembro =>
    miembro.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    miembro.correo_electronico?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    miembro.carrera?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    miembro.semestre?.toString().includes(searchTerm)
  );

  const filteredInvitados = asistentes.invitados.filter(invitado =>
    invitado.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invitado.correo_electronico?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invitado.carrera?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invitado.semestre?.toString().includes(searchTerm)
  );

  // Combinar miembros e invitados con un tipo identificador
  const combinedAsistentes = [
    ...filteredMiembros.map(m => ({ ...m, tipo: 'miembro' })),
    ...filteredInvitados.map(i => ({ ...i, tipo: 'invitado' }))
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-400">Cargando asistentes...</p>
        </div>
      </div>
    );
  }

  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return '';
    const fecha = new Date(fechaStr);
    return fecha.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header con información del evento */}
      <div className="bg-gray-800/70 rounded-lg shadow-lg p-6 mb-8 border border-gray-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <FaUsers className="text-blue-400" /> 
              Gestión de Asistentes
            </h2>
            {eventoInfo && (
              <div className="mt-2">
                <p className="text-xl font-semibold text-blue-300">
                  {eventoInfo.nombre_evento}
                </p>
                <p className="text-gray-300 flex items-center gap-2 mt-1">
                  <FaCalendarAlt className="text-gray-400" /> 
                  {formatearFecha(eventoInfo.fecha)}
                </p>
              </div>
            )}
          </div>
          <Button 
            onClick={() => router.push('/admin')} 
            variant="secondary"
            icon={<FaArrowLeft />}
            className="w-full md:w-auto transition-all hover:bg-gray-600"
          >
            Volver a Eventos
          </Button>
        </div>
      </div>

      {/* Buscador */}
      <div className="mb-8">
        <div className="relative">
          <Input
            type="text"
            placeholder="Buscar por nombre, correo, carrera o semestre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 bg-gray-800 border-gray-700 focus:border-blue-500 focus:ring-blue-500"
          />
          <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800 rounded-lg shadow-md p-4 border border-blue-900/30">
          <p className="text-gray-400 text-sm">Total Asistentes</p>
          <p className="text-2xl font-bold text-white">{asistentes.miembros.length + asistentes.invitados.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg shadow-md p-4 border border-blue-900/30">
          <p className="text-gray-400 text-sm">Miembros</p>
          <p className="text-2xl font-bold text-blue-300">{asistentes.miembros.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg shadow-md p-4 border border-blue-900/30">
          <p className="text-gray-400 text-sm">Invitados</p>
          <p className="text-2xl font-bold text-purple-300">{asistentes.invitados.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg shadow-md p-4 border border-blue-900/30">
          <p className="text-gray-400 text-sm">Total Asistencia</p>
          <p className="text-2xl font-bold text-green-300">
            {asistentes.miembros.filter(m => m.asistio).length + asistentes.invitados.filter(i => i.asistio).length}
          </p>
        </div>
      </div>

      {/* Tabla Única de Asistentes */}
      <div className="bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <FaUsers className="text-blue-400" /> Lista de Asistentes
            <span className="bg-blue-600 text-xs rounded-full px-2 py-1 ml-2">
              {combinedAsistentes.length}
            </span>
          </h3>
          <div className="flex gap-2">
            <span className="flex items-center text-sm text-blue-300">
              <FaUserTie className="mr-1" /> Miembros: {asistentes.miembros.length}
            </span>
            <span className="flex items-center text-sm text-purple-300">
              <FaUserFriends className="mr-1" /> Invitados: {asistentes.invitados.length}
            </span>
          </div>
        </div>
        
        {combinedAsistentes.length > 0 ? (
          <div className="overflow-x-auto">
            <Table
              columns={[
                { 
                  header: 'Tipo', 
                  accessor: 'tipo',
                  render: (asistente) => (
                    <div className={`flex items-center gap-2 ${
                      asistente.tipo === 'miembro' ? 'text-blue-300' : 'text-purple-300'
                    }`}>
                      {asistente.tipo === 'miembro' ? (
                        <FaUserTie title="Miembro" />
                      ) : (
                        <FaUserFriends title="Invitado" />
                      )}
                      <span className="capitalize">{asistente.tipo}</span>
                    </div>
                  ),
                  cellClassName: 'font-medium'
                },
                { 
                  header: 'Nombre', 
                  accessor: 'nombre_completo',
                  cellClassName: 'font-medium'
                },
                { 
                  header: 'Carrera', 
                  accessor: 'carrera',
                  render: (asistente) => (
                    <div className="flex items-center gap-2">
                      <FaGraduationCap className="text-gray-500" />
                      <span>{asistente.carrera || 'No especificado'}</span>
                    </div>
                  ),
                  cellClassName: 'text-gray-300'
                },
                { 
                  header: 'Semestre', 
                  accessor: 'semestre',
                  render: (asistente) => (
                    <div className="flex items-center gap-2 justify-center">
                      <FaBook className="text-gray-500" />
                      <span>{asistente.semestre || 'N/A'}</span>
                    </div>
                  ),
                  cellClassName: 'text-gray-300 text-center'
                },
                { 
                  header: 'Correo', 
                  accessor: 'correo_electronico',
                  render: (asistente) => (
                    <div className="flex items-center gap-2">
                      <FaEnvelope className="text-gray-500" />
                      <span className="text-gray-300">{asistente.correo_electronico}</span>
                    </div>
                  ),
                  cellClassName: 'text-gray-400 text-sm'
                },
                {
                  header: 'Asistencia',
                  render: (asistente) => (
                    <button
                      onClick={() => handleToggleAsistencia(
                        asistente.tipo === 'miembro' ? asistente.id_miembro : asistente.id_invitado,
                        asistente.tipo === 'miembro',
                        asistente.asistio
                      )}
                      className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-all ${
                        asistente.asistio 
                          ? 'bg-green-700 hover:bg-green-800 text-white' 
                          : 'bg-red-700 hover:bg-red-800 text-white'
                      }`}
                    >
                      {asistente.asistio ? (
                        <>
                          <FaCheck /> Asistió
                        </>
                      ) : (
                        <>
                          <FaTimes /> No asistió
                        </>
                      )}
                    </button>
                  )
                },
                {
                  header: 'Acciones',
                  render: (asistente) => (
                    <button
                      onClick={() => handleDeleteConfirmation(
                        asistente.tipo === 'miembro' ? asistente.id_miembro : asistente.id_invitado,
                        asistente.tipo === 'miembro',
                        asistente.nombre_completo
                      )}
                      className="bg-red-600 hover:bg-red-700 text-white py-1 px-3 rounded-md flex items-center gap-1 text-sm transition-all"
                    >
                      <FaTrash size={12} /> Eliminar
                    </button>
                  ),
                  cellClassName: 'text-right'
                }
              ]}
              data={combinedAsistentes}
              emptyMessage="No hay asistentes registrados en este evento"
              className="w-full"
              headerClassName="bg-gray-700 text-gray-300"
              rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
            />
          </div>
        ) : (
          <div className="bg-gray-700/30 rounded-lg p-8 text-center">
            <p className="text-gray-400">No hay asistentes que coincidan con tu búsqueda</p>
          </div>
        )}
      </div>

      {/* Modal de confirmación de eliminación */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Confirmar eliminación</h3>
            <p className="text-gray-300 mb-6">
              ¿Estás seguro de que deseas eliminar a <span className="font-semibold text-red-300">{deleteConfirmation.nombre}</span> de la lista de asistentes?
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <Button 
                onClick={() => setDeleteConfirmation(null)} 
                variant="secondary"
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button 
                onClick={() => handleEliminarAsistente(deleteConfirmation.idAsistente, deleteConfirmation.esMiembro)} 
                variant="destructive"
                className="w-full sm:w-auto bg-red-600 hover:bg-red-700"
                icon={<FaTrash />}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}