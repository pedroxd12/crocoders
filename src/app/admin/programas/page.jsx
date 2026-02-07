'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaPlus, FaEdit, FaTrash, FaCalendarAlt, FaUsers, FaCertificate } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function ProgramasRecurrentes() {
  const router = useRouter();
  const [programas, setProgramas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPrograma, setEditingPrograma] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    fecha_inicio: '',
    fecha_fin: '',
    id_tipo_evento: '',
    id_alcance: '',
    sesiones_requeridas_certificado: 0,
    porcentaje_asistencia_minimo: 80.00,
    ubicacion: '',
    imagen_url: ''
  });

  // Catálogos
  const [tiposEvento, setTiposEvento] = useState([]);
  const [alcances, setAlcances] = useState([]);

  useEffect(() => {
    fetchProgramas();
    fetchCatalogos();
  }, []);

  const fetchProgramas = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/programas');
      if (res.ok) {
        const data = await res.json();
        setProgramas(data);
      }
    } catch (error) {
      toast.error('Error al cargar programas');
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogos = async () => {
    try {
      const res = await fetch('/api/admin/catalogos');
      if (res.ok) {
        const data = await res.json();
        setTiposEvento(data.tiposEvento || []);
        setAlcances(data.alcances || []);
      }
    } catch (error) {
      console.error('Error loading catalogos:', error);
    }
  };

  const handleOpenModal = (programa = null) => {
    if (programa) {
      setEditingPrograma(programa);
      setFormData({
        nombre: programa.nombre,
        descripcion: programa.descripcion || '',
        fecha_inicio: programa.fecha_inicio.split('T')[0],
        fecha_fin: programa.fecha_fin.split('T')[0],
        id_tipo_evento: programa.id_tipo_evento,
        id_alcance: programa.id_alcance,
        sesiones_requeridas_certificado: programa.sesiones_requeridas_certificado || 0,
        porcentaje_asistencia_minimo: programa.porcentaje_asistencia_minimo || 80.00,
        ubicacion: programa.ubicacion || '',
        imagen_url: programa.imagen_url || ''
      });
    } else {
      setEditingPrograma(null);
      setFormData({
        nombre: '',
        descripcion: '',
        fecha_inicio: '',
        fecha_fin: '',
        id_tipo_evento: '',
        id_alcance: '',
        sesiones_requeridas_certificado: 0,
        porcentaje_asistencia_minimo: 80.00,
        ubicacion: '',
        imagen_url: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = editingPrograma
        ? `/api/admin/programas/${editingPrograma.id_programa}`
        : '/api/admin/programas';
      
      const method = editingPrograma ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          activo: editingPrograma ? editingPrograma.activo : true
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al guardar programa');
      }

      toast.success(editingPrograma ? 'Programa actualizado' : 'Programa creado');
      setIsModalOpen(false);
      fetchProgramas();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar programa? Esto eliminará todas las sesiones e inscripciones asociadas.')) return;

    try {
      const res = await fetch(`/api/admin/programas/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      
      toast.success('Programa eliminado');
      fetchProgramas();
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <FaCalendarAlt /> Programas Recurrentes
        </h1>
        <Button onClick={() => handleOpenModal()} variant="primary">
          <FaPlus /> Nuevo Programa
        </Button>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-md p-4">
        <Table
          columns={[
            { key: 'nombre', label: 'Nombre' },
            { 
              key: 'fecha_inicio', 
              label: 'Periodo',
              render: (row) => (
                <span>
                  {new Date(row.fecha_inicio).toLocaleDateString()} - {new Date(row.fecha_fin).toLocaleDateString()}
                </span>
              )
            },
            { key: 'tipo_evento', label: 'Tipo' },
            { key: 'total_sesiones', label: 'Sesiones', cellClassName: 'text-center' },
            { key: 'total_inscritos', label: 'Inscritos', cellClassName: 'text-center' },
            {
              key: 'activo',
              label: 'Estado',
              render: (row) => (
                <span className={`px-2 py-1 rounded text-xs ${row.activo ? 'bg-green-600' : 'bg-gray-600'}`}>
                  {row.activo ? 'Activo' : 'Inactivo'}
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
                    onClick={() => router.push(`/admin/programas/${row.id_programa}/sesiones`)}
                    variant="text"
                    size="sm"
                    className="text-blue-400 hover:text-blue-300"
                    title="Ver sesiones"
                  >
                    <FaCalendarAlt />
                  </Button>
                  <Button
                    onClick={() => router.push(`/admin/programas/${row.id_programa}/asistencia`)}
                    variant="text"
                    size="sm"
                    className="text-green-400 hover:text-green-300"
                    title="Reporte de asistencia"
                  >
                    <FaUsers />
                  </Button>
                  <Button
                    onClick={() => handleOpenModal(row)}
                    variant="text"
                    size="sm"
                    className="text-yellow-400 hover:text-yellow-300"
                  >
                    <FaEdit />
                  </Button>
                  <Button
                    onClick={() => handleDelete(row.id_programa)}
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
          data={programas}
          emptyMessage="No hay programas recurrentes registrados"
          className="w-full"
          headerClassName="bg-gray-700 text-gray-300"
          rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPrograma ? 'Editar Programa' : 'Nuevo Programa'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre del Programa *"
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            required
          />

          <Textarea
            label="Descripción"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Fecha Inicio *"
              type="date"
              value={formData.fecha_inicio}
              onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
              required
            />

            <Input
              label="Fecha Fin *"
              type="date"
              value={formData.fecha_fin}
              onChange={(e) => setFormData({ ...formData, fecha_fin: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Tipo de Evento *"
              value={formData.id_tipo_evento}
              onChange={(e) => setFormData({ ...formData, id_tipo_evento: e.target.value })}
              options={tiposEvento.map(t => ({ value: t.id_tipo_evento, label: t.nombre }))}
              required
            />

            <Select
              label="Alcance *"
              value={formData.id_alcance}
              onChange={(e) => setFormData({ ...formData, id_alcance: e.target.value })}
              options={alcances.map(a => ({ value: a.id_alcance, label: a.nombre }))}
              required
            />
          </div>

          <Input
            label="Ubicación"
            value={formData.ubicacion}
            onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Sesiones Requeridas (Certificado)"
              type="number"
              min="0"
              value={formData.sesiones_requeridas_certificado}
              onChange={(e) => setFormData({ ...formData, sesiones_requeridas_certificado: parseInt(e.target.value) || 0 })}
            />

            <Input
              label="% Asistencia Mínimo"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.porcentaje_asistencia_minimo}
              onChange={(e) => setFormData({ ...formData, porcentaje_asistencia_minimo: parseFloat(e.target.value) || 80 })}
            />
          </div>

          <Input
            label="URL de Imagen"
            value={formData.imagen_url}
            onChange={(e) => setFormData({ ...formData, imagen_url: e.target.value })}
            placeholder="https://ejemplo.com/imagen.jpg"
          />

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="secondary">
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? <LoadingSpinner size="sm" /> : (editingPrograma ? 'Actualizar' : 'Crear')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
