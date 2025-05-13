// src/app/admin/eventos/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaPlus, FaEdit, FaTrash, FaUsers, FaCalendarAlt, FaSearch, FaEye } from 'react-icons/fa';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Table from '@/components/ui/Table';
import LoadingSpinner from '@/components/LoadingSpinner';
import { UploadButton } from "@/utils/uploadthing";
import Image from 'next/image'; // <-- Added this import

export default function EventosAdmin() {
  const router = useRouter();
  const [eventos, setEventos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentEvento, setCurrentEvento] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    nombre_evento: '',
    descripcion: '',
    tipo: 'conferencia',
    hermandad: 'club de programación',
    fecha: '',
    hora_inicio: '',
    hora_fin: '',
    cupos: 0,
    costo: 0,
    imagen_url: null,
    imagen_key: null
  });

  const tiposEvento = [
    { value: 'concurso', label: 'Concurso' },
    { value: 'conferencia', label: 'Conferencia' },
    { value: 'curso', label: 'Curso' },
    { value: 'reunion', label: 'Reunión' },
    { value: 'taller', label: 'Taller' }
  ];

  const hermandades = [
    { value: 'club de programación', label: 'Club de Programación' },
    { value: 'computer society', label: 'Computer Society' },
  ];

  useEffect(() => {
    fetchEventos();
  }, []);

  const fetchEventos = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/eventos');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al cargar eventos');
      }
      const data = await res.json();
      setEventos(data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEventos = eventos.filter(evento =>
    evento.nombre_evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (evento.descripcion && evento.descripcion.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (evento.tipo && evento.tipo.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const payload = { ...formData };
      payload.cupos = Number(payload.cupos) || 0;
      payload.costo = Number(payload.costo) || 0.00;

      const method = currentEvento ? 'PUT' : 'POST';
      const url = currentEvento 
        ? `/api/admin/eventos/${currentEvento.id_evento}`
        : '/api/admin/eventos';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al guardar el evento');
      }

      toast.success(`Evento ${currentEvento ? 'actualizado' : 'creado'} correctamente`);
      setIsModalOpen(false);
      fetchEventos(); 
    } catch (error) {
      console.error('Error al guardar evento:', error);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este evento? Esta acción no se puede deshacer y también eliminará su imagen asociada.')) return;
    
    try {
      const res = await fetch(`/api/admin/eventos/${id}`, { method: 'DELETE' });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al eliminar el evento');
      }
      
      toast.success('Evento eliminado correctamente');
      fetchEventos(); 
    } catch (error) {
      toast.error(error.message);
    }
  };

  const openEditModal = (evento) => {
    setCurrentEvento(evento);
    setFormData({
      nombre_evento: evento.nombre_evento || '',
      descripcion: evento.descripcion || '',
      tipo: evento.tipo || 'conferencia',
      hermandad: evento.hermandad || 'club de programación',
      fecha: evento.fecha ? evento.fecha.split('T')[0] : '',
      hora_inicio: evento.hora_inicio || '',
      hora_fin: evento.hora_fin || '',
      cupos: evento.cupos || 0,
      costo: evento.costo || 0,
      imagen_url: evento.imagen_url || null,
      imagen_key: evento.imagen_key || null
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setCurrentEvento(null);
    setFormData({
      nombre_evento: '',
      descripcion: '',
      tipo: 'conferencia',
      hermandad: 'club de programación',
      fecha: '',
      hora_inicio: '',
      hora_fin: '',
      cupos: 0,
      costo: 0,
      imagen_url: null,
      imagen_key: null
    });
    setIsModalOpen(true);
  };
  
  const handleRemoveImage = () => {
    setFormData(prev => ({
        ...prev,
        imagen_url: null,
        imagen_key: null
    }));
    if (currentEvento && currentEvento.imagen_key) {
        // The backend will handle deletion from UploadThing upon saving the form
        // if imagen_key becomes null for an existing event.
        toast.info("La imagen se eliminará al guardar los cambios.");
    }
  };

  const viewAsistentes = (idEvento) => {
    router.push(`/admin/eventos/${idEvento}/asistentes`);
  };

  if (isLoading && !eventos.length) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner text="Cargando eventos..." />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FaCalendarAlt /> Gestión de Eventos
        </h2>
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          <Input
            type="text"
            placeholder="Buscar eventos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-64 bg-gray-700 border-gray-600 focus:border-green-500"
          />
          <Button 
            onClick={openCreateModal} 
            variant="primary"
            className="w-full md:w-auto flex items-center justify-center"
          >
            <FaPlus className="mr-2"/> Nuevo Evento
          </Button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <Table
          columns={[
            { 
              header: 'Imagen',
              render: (evento) => (
                evento.imagen_url ? 
                <Image src={evento.imagen_url} alt={evento.nombre_evento || "Imagen del evento"} width={64} height={64} className="object-cover rounded h-16 w-16" onError={(e) => e.target.style.display='none'}/> 
                : <div className="h-16 w-16 bg-gray-700 rounded flex items-center justify-center text-xs text-gray-500">Sin img</div>
              )
            },
            { header: 'Nombre', accessor: 'nombre_evento', cellClassName: 'font-medium py-3 px-4' },
            { 
              header: 'Fecha y Hora', 
              render: (evento) => (
                <div className="text-sm py-3 px-4">
                  <div>{evento.fecha ? new Date(evento.fecha).toLocaleDateString('es-ES') : 'N/A'}</div>
                  <div className="text-gray-400 text-xs">
                    {evento.hora_inicio || 'N/A'} - {evento.hora_fin || 'N/A'}
                  </div>
                </div>
              )
            },
            { header: 'Tipo', render: (evento) => <span className="capitalize px-2 py-1 bg-gray-700 rounded-full text-xs">{evento.tipo}</span>, cellClassName: 'py-3 px-4' },
            { header: 'Asistentes', render: (evento) => <span className="text-sm">{evento.asistentes_count || 0}</span>, cellClassName: 'py-3 px-4 text-center' },
            {
              header: 'Acciones',
              render: (evento) => (
                <div className="flex gap-2 justify-end py-3 px-4">
                  <Button onClick={() => viewAsistentes(evento.id_evento)} variant="text" size="sm" title="Ver asistentes" className="text-blue-400 hover:text-blue-300 p-2"><FaEye /></Button>
                  <Button onClick={() => openEditModal(evento)} variant="text" size="sm" title="Editar evento" className="text-green-400 hover:text-green-300 p-2"><FaEdit /></Button>
                  <Button onClick={() => handleDelete(evento.id_evento)} variant="text" size="sm" title="Eliminar evento" className="text-red-400 hover:text-red-300 p-2"><FaTrash /></Button>
                </div>
              ),
              cellClassName: "text-right"
            }
          ]}
          data={filteredEventos}
          emptyMessage={<div className="text-center py-8 text-gray-400">No hay eventos registrados</div>}
          className="w-full" // Added from previous example, assuming Table supports it
          headerClassName="bg-gray-700 text-gray-300" // Added
          rowClassName="border-b border-gray-700 hover:bg-gray-700/50" // Added
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentEvento ? 'Editar Evento' : 'Crear Nuevo Evento'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nombre del Evento" name="nombre_evento" value={formData.nombre_evento} onChange={handleInputChange} required className="bg-gray-700 border-gray-600 focus:border-green-500" />
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Tipo de Evento</label>
              <select name="tipo" value={formData.tipo} onChange={handleInputChange} required className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition">
                {tiposEvento.map(tipo => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Comunidades</label>
              <select name="hermandad" value={formData.hermandad} onChange={handleInputChange} required className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition">
                {hermandades.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
            <Input label="Fecha" type="date" name="fecha" value={formData.fecha} onChange={handleInputChange} required className="bg-gray-700 border-gray-600 focus:border-green-500" />
            <Input label="Hora Inicio" type="time" name="hora_inicio" value={formData.hora_inicio} onChange={handleInputChange} required className="bg-gray-700 border-gray-600 focus:border-green-500" />
            <Input label="Hora Fin" type="time" name="hora_fin" value={formData.hora_fin} onChange={handleInputChange} required className="bg-gray-700 border-gray-600 focus:border-green-500" />
            <Input label="Cupos Disponibles" type="number" name="cupos" min="0" value={formData.cupos} onChange={handleInputChange} className="bg-gray-700 border-gray-600 focus:border-green-500" />
            <Input label="Costo ($)" type="number" name="costo" min="0" step="0.01" value={formData.costo} onChange={handleInputChange} className="bg-gray-700 border-gray-600 focus:border-green-500" />
          </div>
          
          <Textarea label="Descripción" name="descripcion" value={formData.descripcion} onChange={handleInputChange} required rows={4} className="bg-gray-700 border-gray-600 focus:border-green-500" />

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Imagen del Evento</label>
            <UploadButton
                endpoint="eventoImageUploader" // Ensure this matches your core.js endpoint
                onClientUploadComplete={(res) => {
                    if (res && res.length > 0) {
                        toast.success("Imagen subida con éxito!");
                        setFormData(prev => ({ ...prev, imagen_url: res[0].url, imagen_key: res[0].key }));
                    }
                }}
                onUploadError={(error) => {
                    toast.error(`Error al subir imagen: ${error.message}`);
                }}
                className="mt-2 ut-button:bg-green-600 ut-button:ut-hover:bg-green-700 ut-button:text-slate-50 ut-allowed-content:text-gray-400"
            />
            {formData.imagen_url && (
                <div className="mt-3">
                    <p className="text-sm text-gray-400 mb-1">Previsualización:</p>
                    <Image src={formData.imagen_url} alt="Previsualización del evento" width={120} height={120} className="h-32 w-auto object-cover rounded-md border border-gray-600" />
                    <Button type="button" onClick={handleRemoveImage} variant="text" size="sm" color="red" className="mt-1 text-xs">
                        Quitar Imagen
                    </Button>
                </div>
            )}
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="secondary" disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={isSubmitting} className="min-w-32">
              {isSubmitting ? <LoadingSpinner size="sm" /> : (currentEvento ? 'Actualizar Evento' : 'Crear Evento')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}