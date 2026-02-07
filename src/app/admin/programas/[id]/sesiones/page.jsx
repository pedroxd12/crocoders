'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaArrowLeft, FaPlus, FaTrash, FaCalendarCheck, FaUsers } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function ProgramaSesiones() {
  const { id } = useParams();
  const router = useRouter();
  const [programa, setPrograma] = useState(null);
  const [sesiones, setSesiones] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    id_evento: '',
    numero_sesion: 1,
    titulo: '',
    descripcion: '',
    es_obligatoria: true
  });

  useEffect(() => {
    Promise.all([
      fetchPrograma(),
      fetchSesiones(),
      fetchEventosDisponibles()
    ]).finally(() => setLoading(false));
  }, [id]);

  const fetchPrograma = async () => {
    try {
      const res = await fetch(`/api/admin/programas/${id}`);
      if (res.ok) {
        setPrograma(await res.json());
      } else {
        toast.error('Programa no encontrado');
        router.back();
      }
    } catch (error) {
      toast.error('Error al cargar programa');
    }
  };

  const fetchSesiones = async () => {
    try {
      const res = await fetch(`/api/admin/programas/${id}/sesiones`);
      if (res.ok) {
        setSesiones(await res.json());
      }
    } catch (error) {
      toast.error('Error al cargar sesiones');
    }
  };

  const fetchEventosDisponibles = async () => {
    try {
      // Obtener eventos que aún no están asignados a ningún programa
      const res = await fetch('/api/admin/eventos');
      if (res.ok) {
        const data = await res.json();
        setEventos(data);
      }
    } catch (error) {
      console.error('Error loading eventos:', error);
    }
  };

  const handleOpenModal = () => {
    const siguienteNumero = sesiones.length > 0 
      ? Math.max(...sesiones.map(s => s.numero_sesion)) + 1 
      : 1;
    
    setFormData({
      id_evento: '',
      numero_sesion: siguienteNumero,
      titulo: '',
      descripcion: '',
      es_obligatoria: true
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/admin/programas/${id}/sesiones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al agregar sesión');
      }

      toast.success('Sesión agregada correctamente');
      setIsModalOpen(false);
      fetchSesiones();
      fetchEventosDisponibles();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSesion = async (idSesion) => {
    if (!confirm('¿Eliminar esta sesión del programa?')) return;

    try {
      const res = await fetch(`/api/admin/programas/${id}/sesiones/${idSesion}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Error al eliminar sesión');

      toast.success('Sesión eliminada');
      fetchSesiones();
      fetchEventosDisponibles();
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button onClick={() => router.back()} variant="text" className="text-gray-400 hover:text-white mb-4 flex items-center gap-2">
          <FaArrowLeft /> Volver a Programas
        </Button>

        {programa && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">{programa.nombre}</h1>
            <p className="text-gray-400 mb-4">{programa.descripcion}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-white">{programa.total_sesiones}</div>
                <div className="text-xs text-gray-400">Sesiones</div>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-400">{programa.total_inscritos}</div>
                <div className="text-xs text-gray-400">Inscritos</div>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-400">{programa.sesiones_requeridas_certificado}</div>
                <div className="text-xs text-gray-400">Sesiones Requeridas</div>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-400">{programa.porcentaje_asistencia_minimo}%</div>
                <div className="text-xs text-gray-400">% Mínimo</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FaCalendarCheck /> Sesiones del Programa
        </h2>
        <Button onClick={handleOpenModal} variant="primary">
          <FaPlus /> Agregar Sesión
        </Button>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-md p-4">
        <Table
          columns={[
            { 
              key: 'numero_sesion', 
              label: '#',
              cellClassName: 'font-bold text-green-400'
            },
            { 
              key: 'titulo', 
              label: 'Título',
              render: (row) => row.titulo || row.evento_nombre
            },
            { 
              key: 'fecha_inicio', 
              label: 'Fecha y Hora',
              render: (row) => (
                <div>
                  <div>{new Date(row.fecha_inicio).toLocaleDateString()}</div>
                  <div className="text-xs text-gray-400">{row.hora_inicio} - {row.hora_fin}</div>
                </div>
              )
            },
            { key: 'ubicacion', label: 'Ubicación' },
            { 
              key: 'total_asistentes', 
              label: 'Asistentes',
              cellClassName: 'text-center'
            },
            {
              key: 'asistencia',
              label: 'Asistieron',
              render: (row) => (
                <span className="text-green-400 font-bold">
                  {row.total_asistentes > 0 
                    ? `${Math.round((row.asistentes_presentes / row.total_asistentes) * 100)}%`
                    : '0%'
                  }
                </span>
              ),
              cellClassName: 'text-center'
            },
            {
              key: 'es_obligatoria',
              label: 'Obligatoria',
              render: (row) => (
                <span className={`px-2 py-1 rounded text-xs ${row.es_obligatoria ? 'bg-red-600' : 'bg-gray-600'}`}>
                  {row.es_obligatoria ? 'Sí' : 'No'}
                </span>
              ),
              cellClassName: 'text-center'
            },
            {
              key: 'acciones',
              label: 'Acciones',
              render: (row) => (
                <div className="flex gap-2 justify-end">
                  <Button
                    onClick={() => router.push(`/admin/eventos/${row.id_evento}`)}
                    variant="text"
                    size="sm"
                    className="text-blue-400 hover:text-blue-300"
                    title="Ver evento"
                  >
                    Ver Evento
                  </Button>
                  <Button
                    onClick={() => handleDeleteSesion(row.id_sesion)}
                    variant="text"
                    size="sm"
                    className="text-red-400 hover:text-red-300"
                  >
                    <FaTrash />
                  </Button>
                </div>
              ),
              cellClassName: 'text-right'
            }
          ]}
          data={sesiones}
          emptyMessage="No hay sesiones agregadas a este programa"
          className="w-full"
          headerClassName="bg-gray-700 text-gray-300"
          rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Agregar Sesión al Programa"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Seleccionar Evento *"
            value={formData.id_evento}
            onChange={(e) => setFormData({ ...formData, id_evento: e.target.value })}
            options={eventos.map(ev => ({ 
              value: ev.id_evento, 
              label: `${ev.nombre} - ${new Date(ev.fecha_inicio).toLocaleDateString()}`
            }))}
            required
          />

          <Input
            label="Número de Sesión *"
            type="number"
            min="1"
            value={formData.numero_sesion}
            onChange={(e) => setFormData({ ...formData, numero_sesion: parseInt(e.target.value) })}
            required
          />

          <Input
            label="Título de la Sesión"
            value={formData.titulo}
            onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
            placeholder="Opcional - Se usa el nombre del evento si está vacío"
          />

          <Textarea
            label="Descripción"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            rows={3}
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="es_obligatoria"
              checked={formData.es_obligatoria}
              onChange={(e) => setFormData({ ...formData, es_obligatoria: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="es_obligatoria" className="text-gray-300">
              Sesión obligatoria para certificado
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="secondary">
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? <LoadingSpinner size="sm" /> : 'Agregar Sesión'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
