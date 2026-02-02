'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaPlus, FaEdit, FaTrash, FaUsers, FaCalendarAlt, FaSearch, FaEye, FaUserShield } from 'react-icons/fa';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Table from '@/components/ui/Table';
import LoadingSpinner from '@/components/LoadingSpinner';
import { UploadButton } from "@/utils/uploadthing";
import Image from 'next/image';

export default function EventosAdmin() {
  const router = useRouter();
  const [eventos, setEventos] = useState([]);
  const [catalogs, setCatalogs] = useState({ tipos: [], alcances: [], plataformas: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentEvento, setCurrentEvento] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion_html: '',
    id_tipo_evento: '',
    id_alcance: '',
    fecha_inicio: '',
    fecha_fin: '',
    hora_inicio: '',
    hora_fin: '',
    ubicacion: '',
    cupos: 0,
    costo: 0,
    tiene_costo: false,
    imagen_flyer_url: null,
    imagen_flyer_key: null,
    // Concurso specific
    es_concurso: false,
    modalidad: 'individual',
    max_integrantes_equipo: 3,
    id_plataforma: '',
    requiere_asesor: false,
    url_concurso: ''
  });

  useEffect(() => {
    Promise.all([fetchEventos(), fetchCatalogs()]);
  }, []);

  const fetchCatalogs = async () => {
    try {
      const res = await fetch('/api/admin/catalogos');
      if (res.ok) {
        const data = await res.json();
        setCatalogs(data);
      }
    } catch (error) {
      console.error('Error fetching catalogs:', error);
    }
  };

  const fetchEventos = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/eventos');
      if (!res.ok) throw new Error('Error al cargar eventos');
      const data = await res.json();
      setEventos(data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEventos = eventos.filter(evento =>
    evento.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (evento.descripcion_html && evento.descripcion_html.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    // Special handling for checkboxes
    const val = type === 'checkbox' ? checked : value;

    setFormData(prev => {
      const newData = { ...prev, [name]: val };
      
      // Auto-detect if 'es_concurso' should be enabled based on type
      if (name === 'id_tipo_evento') {
        const selectedTipo = catalogs.tipos.find(t => t.id_tipo_evento === parseInt(val));
        const tipoName = selectedTipo ? selectedTipo.nombre.toLowerCase() : '';
        if (tipoName.includes('concurso') || tipoName.includes('hackathon')) {
            newData.es_concurso = true;
        } else {
            newData.es_concurso = false;
        }
      }
      return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const payload = { ...formData };
      payload.cupos = Number(payload.cupos) || 0;
      payload.costo = Number(payload.costo) || 0.00;
      payload.id_tipo_evento = parseInt(payload.id_tipo_evento);
      payload.id_alcance = parseInt(payload.id_alcance);
      if (payload.id_plataforma) payload.id_plataforma = parseInt(payload.id_plataforma);

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
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este evento?')) return;
    try {
      const res = await fetch(`/api/admin/eventos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      toast.success('Evento eliminado correctamente');
      fetchEventos(); 
    } catch (error) {
      toast.error(error.message);
    }
  };

  const openEditModal = (evento) => {
    setCurrentEvento(evento);
    
    const isContest = evento.id_concurso != null;

    setFormData({
      nombre: evento.nombre,
      descripcion_html: evento.descripcion_html || '',
      id_tipo_evento: evento.id_tipo_evento,
      id_alcance: evento.id_alcance,
      fecha_inicio: evento.fecha_inicio ? evento.fecha_inicio.split('T')[0] : '',
      fecha_fin: evento.fecha_fin ? evento.fecha_fin.split('T')[0] : '',
      hora_inicio: evento.hora_inicio || '',
      hora_fin: evento.hora_fin || '',
      ubicacion: evento.ubicacion || '',
      cupos: evento.cupos || 0,
      costo: evento.costo || 0,
      tiene_costo: evento.tiene_costo,
      imagen_flyer_url: evento.imagen_flyer_url,
      imagen_flyer_key: evento.imagen_key, 
      es_concurso: isContest,
      modalidad: evento.modalidad || 'individual',
      max_integrantes_equipo: evento.max_integrantes_equipo || 3,
      id_plataforma: evento.id_plataforma || '',
      requiere_asesor: evento.requiere_asesor || false,
      url_concurso: evento.url_concurso || ''
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setCurrentEvento(null);
    setFormData({
      nombre: '',
      descripcion_html: '',
      id_tipo_evento: catalogs.tipos[0]?.id_tipo_evento || '',
      id_alcance: catalogs.alcances[0]?.id_alcance || '',
      fecha_inicio: '',
      fecha_fin: '',
      hora_inicio: '',
      hora_fin: '',
      ubicacion: '',
      cupos: 50,
      costo: 0,
      tiene_costo: false,
      imagen_flyer_url: null,
      imagen_flyer_key: null,
      es_concurso: false,
      modalidad: 'individual',
      max_integrantes_equipo: 3,
      id_plataforma: '',
      requiere_asesor: false,
      url_concurso: ''
    });
    setIsModalOpen(true);
  };
  
  const viewAsistentes = (idEvento) => {
    router.push(`/admin/eventos/${idEvento}/asistentes`);
  };

  const viewStaff = (idEvento) => {
    router.push(`/admin/eventos/${idEvento}/staff`);
  };

  if (isLoading && !eventos.length) {
    return <div className="flex justify-center items-center h-screen"><LoadingSpinner text="Cargando eventos..." /></div>;
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
          <Button onClick={openCreateModal} variant="primary" className="w-full md:w-auto flex items-center justify-center">
            <FaPlus className="mr-2"/> Nuevo Evento
          </Button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <Table
          columns={[
            { 
              header: 'Info',
              render: (evento) => (
                <div className="flex items-center gap-3">
                    {evento.imagen_flyer_url ? 
                        <Image src={evento.imagen_flyer_url} alt="Flyer" width={48} height={48} className="object-cover rounded h-12 w-12" /> 
                        : <div className="h-12 w-12 bg-gray-700 rounded flex items-center justify-center text-xs text-gray-400">Sin img</div>
                    }
                    <div>
                        <div className="font-semibold text-white">{evento.nombre}</div>
                        <div className="text-xs text-gray-400">{evento.tipo_nombre}</div>
                    </div>
                </div>
              ),
              cellClassName: 'py-3 px-4'
            },
            { 
              header: 'Fecha', 
              render: (evento) => (
                <div className="text-sm">
                  <div>{new Date(evento.fecha_inicio).toLocaleDateString()}</div>
                  <div className="text-gray-400 text-xs">
                    {evento.hora_inicio} - {evento.hora_fin}
                  </div>
                </div>
              ),
              cellClassName: 'py-3 px-4'
            },
            { header: 'Alcance', accessor: 'alcance_nombre', cellClassName: 'py-3 px-4 text-sm' },
            { 
                header: 'Cupos', 
                render: (e) => <span title={`${e.cupos_disponibles} disponibles`}>{e.cupos_disponibles} / {e.cupos}</span>,
                cellClassName: 'py-3 px-4 text-center' 
            },
            { 
                header: 'Inscritos', 
                accessor: 'total_inscritos',
                cellClassName: 'py-3 px-4 text-center font-bold text-green-400' 
            },
            {
              header: 'Acciones',
              render: (evento) => (
                <div className="flex gap-2 justify-end">
                  <Button onClick={() => viewStaff(evento.id_evento)} variant="text" size="sm" title="Gestionar Staff" className="text-purple-400 hover:text-purple-300 p-1"><FaUserShield /></Button>
                  <Button onClick={() => viewAsistentes(evento.id_evento)} variant="text" size="sm" title="Ver asistentes" className="text-blue-400 hover:text-blue-300 p-1"><FaUsers /></Button>
                  <Button onClick={() => openEditModal(evento)} variant="text" size="sm" title="Editar" className="text-green-400 hover:text-green-300 p-1"><FaEdit /></Button>
                  <Button onClick={() => handleDelete(evento.id_evento)} variant="text" size="sm" title="Eliminar" className="text-red-400 hover:text-red-300 p-1"><FaTrash /></Button>
                </div>
              ),
              cellClassName: "text-right px-4"
            }
          ]}
          data={filteredEventos}
          emptyMessage={<div className="text-center py-8 text-gray-400">No hay eventos registrados</div>}
          className="w-full"
          headerClassName="bg-gray-700 text-gray-300"
          rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentEvento ? 'Editar Evento' : 'Crear Nuevo Evento'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 pr-2">
          {/* Main Info */}
          <div className="grid grid-cols-1 gap-4">
             <Input label="Nombre del Evento" name="nombre" value={formData.nombre} onChange={handleInputChange} required className="bg-gray-700 border-gray-600 focus:border-green-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Tipo de Evento</label>
              <select name="id_tipo_evento" value={formData.id_tipo_evento} onChange={handleInputChange} required className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:outline-none">
                <option value="">Seleccionar Tipo</option>
                {catalogs.tipos.map(t => <option key={t.id_tipo_evento} value={t.id_tipo_evento}>{t.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Alcance (Visibilidad)</label>
              <select name="id_alcance" value={formData.id_alcance} onChange={handleInputChange} required className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:outline-none">
                <option value="">Seleccionar Alcance</option>
                {catalogs.alcances.map(a => <option key={a.id_alcance} value={a.id_alcance}>{a.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Fecha Inicio" type="date" name="fecha_inicio" value={formData.fecha_inicio} onChange={handleInputChange} required className="bg-gray-700 border-gray-600" />
            <Input label="Fecha Fin" type="date" name="fecha_fin" value={formData.fecha_fin} onChange={handleInputChange} className="bg-gray-700 border-gray-600" />
            <Input label="Hora Inicio" type="time" name="hora_inicio" value={formData.hora_inicio} onChange={handleInputChange} required className="bg-gray-700 border-gray-600" />
            <Input label="Hora Fin" type="time" name="hora_fin" value={formData.hora_fin} onChange={handleInputChange} required className="bg-gray-700 border-gray-600" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Ubicación" name="ubicacion" value={formData.ubicacion} onChange={handleInputChange} className="bg-gray-700 border-gray-600 md:col-span-2" />
            <Input label="Cupos" type="number" name="cupos" min="1" value={formData.cupos} onChange={handleInputChange} required className="bg-gray-700 border-gray-600" />
          </div>

          <div className="flex gap-4 items-center bg-gray-700/50 p-3 rounded-lg border border-gray-600">
             <div className="flex items-center h-5">
               <input id="tiene_costo" name="tiene_costo" type="checkbox" checked={formData.tiene_costo} onChange={handleInputChange} className="w-4 h-4 text-green-600 bg-gray-700 border-gray-500 rounded focus:ring-green-500" />
             </div>
             <div className="ml-2 text-sm">
               <label htmlFor="tiene_costo" className="font-medium text-gray-300">¿Tiene costo de acceso?</label>
             </div>
             {formData.tiene_costo && (
                <div className="ml-auto w-32">
                    <Input type="number" name="costo" placeholder="0.00" min="0" step="0.01" value={formData.costo} onChange={handleInputChange} className="bg-gray-700 border-gray-600 py-1" />
                </div>
             )}
          </div>
          
          {/* Concurso Logic */}
          {formData.es_concurso && (
            <div className="border border-green-500/30 bg-green-900/10 p-4 rounded-lg space-y-4">
                <h3 className="text-green-400 font-semibold text-sm border-b border-green-500/30 pb-2 mb-2">Configuración de Concurso</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Modalidad</label>
                        <select name="modalidad" value={formData.modalidad} onChange={handleInputChange} className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600">
                           <option value="individual">Individual</option>
                           <option value="equipos">Equipos</option>
                        </select>
                    </div>
                    {formData.modalidad === 'equipos' && (
                        <Input label="Max. Integrantes" type="number" name="max_integrantes_equipo" min="2" value={formData.max_integrantes_equipo} onChange={handleInputChange} className="bg-gray-700 border-gray-600" />
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Plataforma (Op.)</label>
                        <select name="id_plataforma" value={formData.id_plataforma} onChange={handleInputChange} className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600">
                           <option value="">Ninguna / Otra</option>
                           {catalogs.plataformas.map(p => <option key={p.id_plataforma} value={p.id_plataforma}>{p.nombre}</option>)}
                        </select>
                    </div>
                     <Input label="URL del Concurso" name="url_concurso" value={formData.url_concurso} onChange={handleInputChange} placeholder="https://..." className="bg-gray-700 border-gray-600" />
                </div>
            </div>
          )}

          <Textarea label="Descripción (Soporta HTML básico)" name="descripcion_html" value={formData.descripcion_html} onChange={handleInputChange} rows={3} className="bg-gray-700 border-gray-600" />

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Imagen (Flyer)</label>
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <UploadButton
                        endpoint="eventoImageUploader"
                        onClientUploadComplete={(res) => {
                            if (res && res.length > 0) {
                                toast.success("Imagen subida!");
                                setFormData(prev => ({ ...prev, imagen_flyer_url: res[0].url, imagen_flyer_key: res[0].key }));
                            }
                        }}
                        onUploadError={(error) => toast.error(`Error: ${error.message}`)}
                        className="ut-button:bg-green-600 ut-button:ut-hover:bg-green-700 text-sm"
                    />
                </div>
                {formData.imagen_flyer_url && (
                    <div className="relative">
                        <Image src={formData.imagen_flyer_url} alt="Preview" width={80} height={80} className="h-20 w-auto rounded border border-gray-600" />
                        <button type="button" onClick={() => setFormData(p => ({...p, imagen_flyer_url: null, imagen_flyer_key: null}))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 text-xs">✕</button>
                    </div>
                )}
            </div>
          </div>

          <div className="flex justify-end space-x-4 mt-6 pt-4 border-t border-gray-700">
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="secondary" disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={isSubmitting} className="min-w-32">
              {isSubmitting ? <LoadingSpinner size="sm" /> : (currentEvento ? 'Guardar Cambios' : 'Crear Evento')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
