
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaArrowLeft, FaTrash, FaUserPlus, FaUserShield, FaGavel } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/LoadingSpinner';

const PROCEDENCIAS = [
  { value: 'club_programacion', label: 'Miembro del Club de Programación' },
  { value: 'computer_society', label: 'Asociación (IEEE / Computer Society)' },
  { value: 'itlac', label: 'Universidad (ITLAC)' },
  { value: 'universitario', label: 'Universitario externo' },
  { value: 'preparatoria', label: 'Estudiante de preparatoria' },
  { value: 'otro', label: 'Otro' },
];
const procedenciaLabel = (v) => PROCEDENCIAS.find(p => p.value === v)?.label || v;

export default function EventoStaff() {
  const { id } = useParams(); // event id
  const router = useRouter();
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [availableMembers, setAvailableMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Jueces
  const [jueces, setJueces] = useState([]);
  const [isJuezModalOpen, setIsJuezModalOpen] = useState(false);
  const [juezForm, setJuezForm] = useState({
    id_miembro: '', nombre_completo: '', correo_electronico: '',
    numero_telefono: '', institucion: '', procedencia: 'otro', es_principal: false,
  });
  const [submittingJuez, setSubmittingJuez] = useState(false);

  useEffect(() => {
    Promise.all([
        fetchStaff(),
        fetchCatalogs(),
        fetchMembers(),
        fetchJueces()
    ]).finally(() => setLoading(false));
  }, [id]);

  const fetchJueces = async () => {
    try {
      const res = await fetch(`/api/admin/eventos/${id}/jueces`);
      if (res.ok) setJueces(await res.json());
    } catch (error) {
      console.error('Error al cargar jueces:', error);
    }
  };

  const fetchStaff = async () => {
    try {
        const res = await fetch(`/api/admin/eventos/${id}/staff`);
        if (res.ok) {
            const data = await res.json();
            setStaff(data);
        }
    } catch (error) {
        console.error('Error al cargar staff:', error);
        toast.error('Error al cargar staff');
    }
  };

  const fetchCatalogs = async () => {
      try {
          const res = await fetch('/api/admin/catalogos');
          if (res.ok) {
              const data = await res.json();
              setRoles(data.roles || []);
          }
      } catch (error) {
          console.error('Error al cargar catálogos:', error);
      }
  };

  const fetchMembers = async () => {
      try {
          const res = await fetch('/api/admin/users');
          if (res.ok) {
              const data = await res.json();
              const members = data.filter(u => u.tipo === 'miembro');
              setAvailableMembers(members);
          } else {
              toast.error('Error al cargar miembros');
          }
      } catch (error) {
          console.error('Error al cargar miembros:', error);
          toast.error('Error al cargar lista de miembros');
      }
  };

  const handleAddStaff = async (e) => {
      e.preventDefault();
      if (!selectedMember || !selectedRole) {
          toast.warning('Seleccione miembro y rol');
          return;
      }
      
      setIsSubmitting(true);
      try {
          const res = await fetch(`/api/admin/eventos/${id}/staff`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  id_miembro: selectedMember,
                  id_rol: selectedRole
              })
          });
          
          if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || 'Error al agregar');
          }

          toast.success('Staff agregado correctamente');
          setIsModalOpen(false);
          setSelectedMember('');
          setSelectedRole('');
          fetchStaff();
      } catch (error) {
          toast.error(error.message);
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleDelete = async (idStaff) => {
      if (!confirm('¿Eliminar del staff?')) return;
      try {
          const res = await fetch(`/api/admin/eventos/${id}/staff?id_staff=${idStaff}`, {
              method: 'DELETE'
          });
          if (!res.ok) throw new Error('Error al eliminar');
          
          toast.success('Eliminado correctamente');
          setStaff(prev => prev.filter(s => s.id_staff !== idStaff));
      } catch (error) {
          toast.error(error.message);
      }
  };

  const handleJuezMemberChange = (e) => {
    const memberId = e.target.value;
    const member = availableMembers.find(m => String(m.id) === String(memberId));
    setJuezForm(prev => ({
      ...prev,
      id_miembro: memberId,
      nombre_completo: member ? member.nombre_completo : prev.nombre_completo,
      correo_electronico: member ? (member.email || '') : prev.correo_electronico,
      // Si es miembro del sistema, su procedencia por defecto es el club.
      procedencia: member ? 'club_programacion' : prev.procedencia,
    }));
  };

  const handleAddJuez = async (e) => {
    e.preventDefault();
    if (!juezForm.nombre_completo.trim()) {
      toast.warning('El nombre del juez es requerido');
      return;
    }
    setSubmittingJuez(true);
    try {
      const res = await fetch(`/api/admin/eventos/${id}/jueces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...juezForm,
          id_miembro: juezForm.id_miembro || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al agregar juez');
      }
      toast.success('Juez agregado correctamente');
      setIsJuezModalOpen(false);
      setJuezForm({ id_miembro: '', nombre_completo: '', correo_electronico: '', numero_telefono: '', institucion: '', procedencia: 'otro', es_principal: false });
      fetchJueces();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmittingJuez(false);
    }
  };

  const handleDeleteJuez = async (idJuez) => {
    if (!confirm('¿Eliminar este juez?')) return;
    try {
      const res = await fetch(`/api/admin/eventos/${id}/jueces?id_juez=${idJuez}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      toast.success('Juez eliminado');
      setJueces(prev => prev.filter(j => j.id_juez !== idJuez));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const membersNotInStaff = availableMembers.filter(m => !staff.some(s => s.id_miembro === m.id));

  if (loading) return <LoadingSpinner />;

  return (
    <div className="container mx-auto px-4 py-8">
       <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
                <Button onClick={() => router.back()} variant="text" className="text-gray-400 hover:text-white">
                    <FaArrowLeft />
                </Button>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <FaUserShield /> Staff del Evento
                </h1>
            </div>
            <Button onClick={() => setIsModalOpen(true)} variant="primary" className="flex items-center gap-2">
                <FaUserPlus /> Agregar Staff
            </Button>
       </div>

       <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <Table 
                columns={[
                    { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium text-white px-4 py-3' },
                    { header: 'Correo', accessor: 'correo_electronico', cellClassName: 'text-gray-400 px-4 py-3' },
                    { 
                        header: 'Rol', 
                        render: (row) => <span className="bg-blue-900/50 text-blue-300 px-2 py-1 rounded text-xs border border-blue-500/30">{row.rol_nombre}</span>,
                        cellClassName: 'px-4 py-3'
                    },
                    {
                        header: 'Acciones',
                        render: (row) => (
                            <Button onClick={() => handleDelete(row.id_staff)} variant="text" size="sm" className="text-red-400 hover:text-red-300">
                                <FaTrash />
                            </Button>
                        ),
                        cellClassName: 'text-right px-4 py-3'
                    }
                ]}
                data={staff}
                emptyMessage="No hay staff asignado a este evento."
                className="w-full"
                headerClassName="bg-gray-700 text-gray-300"
                rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
            />
       </div>

       <Modal
         isOpen={isModalOpen}
         onClose={() => setIsModalOpen(false)}
         title="Agregar Miembro al Staff"
       >
          <form onSubmit={handleAddStaff} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Miembro</label>
                <select 
                    value={selectedMember} 
                    onChange={(e) => setSelectedMember(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500"
                >
                    <option value="">Seleccionar Miembro</option>
                    {membersNotInStaff.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre_completo} ({m.email})</option>
                    ))}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Rol</label>
                <select 
                    value={selectedRole} 
                    onChange={(e) => setSelectedRole(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500"
                >
                    <option value="">Seleccionar Rol</option>
                    {roles.map(r => (
                        <option key={r.id_rol} value={r.id_rol}>{r.nombre}</option>
                    ))}
                </select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" onClick={() => setIsModalOpen(false)} variant="secondary">Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                    {isSubmitting ? <LoadingSpinner size="sm" /> : 'Agregar'}
                </Button>
            </div>
          </form>
       </Modal>

       {/* ----------------------- Jueces ----------------------- */}
       <div className="flex justify-between items-center mt-10 mb-6">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <FaGavel /> Jueces del Evento
            </h1>
            <Button onClick={() => setIsJuezModalOpen(true)} variant="primary" className="flex items-center gap-2">
                <FaUserPlus /> Agregar Juez
            </Button>
       </div>

       <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <Table
                columns={[
                    { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium text-white px-4 py-3' },
                    { header: 'Correo', accessor: 'correo_electronico', cellClassName: 'text-gray-400 px-4 py-3' },
                    { header: 'Institución', accessor: 'institucion', cellClassName: 'text-gray-400 px-4 py-3' },
                    {
                        header: 'Procedencia',
                        render: (row) => <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-xs border border-purple-500/30">{procedenciaLabel(row.procedencia)}</span>,
                        cellClassName: 'px-4 py-3'
                    },
                    {
                        header: 'Principal',
                        render: (row) => row.es_principal ? <span className="text-green-400 text-xs font-bold">Sí</span> : <span className="text-gray-500 text-xs">—</span>,
                        cellClassName: 'text-center px-4 py-3'
                    },
                    {
                        header: 'Acciones',
                        render: (row) => (
                            <Button onClick={() => handleDeleteJuez(row.id_juez)} variant="text" size="sm" className="text-red-400 hover:text-red-300">
                                <FaTrash />
                            </Button>
                        ),
                        cellClassName: 'text-right px-4 py-3'
                    }
                ]}
                data={jueces}
                emptyMessage="No hay jueces asignados a este evento."
                className="w-full"
                headerClassName="bg-gray-700 text-gray-300"
                rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
            />
       </div>

       <Modal
         isOpen={isJuezModalOpen}
         onClose={() => setIsJuezModalOpen(false)}
         title="Agregar Juez"
       >
          <form onSubmit={handleAddJuez} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">¿Es miembro del club? (opcional)</label>
                <select
                    value={juezForm.id_miembro}
                    onChange={handleJuezMemberChange}
                    className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500"
                >
                    <option value="">— Juez externo (capturar datos) —</option>
                    {availableMembers.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre_completo} ({m.email})</option>
                    ))}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nombre completo *</label>
                <input
                    type="text"
                    value={juezForm.nombre_completo}
                    onChange={(e) => setJuezForm(p => ({ ...p, nombre_completo: e.target.value }))}
                    required
                    className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500"
                />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Correo</label>
                    <input
                        type="email"
                        value={juezForm.correo_electronico}
                        onChange={(e) => setJuezForm(p => ({ ...p, correo_electronico: e.target.value }))}
                        className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Teléfono</label>
                    <input
                        type="text"
                        value={juezForm.numero_telefono}
                        onChange={(e) => setJuezForm(p => ({ ...p, numero_telefono: e.target.value }))}
                        className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500"
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Institución</label>
                <input
                    type="text"
                    value={juezForm.institucion}
                    onChange={(e) => setJuezForm(p => ({ ...p, institucion: e.target.value }))}
                    className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Procedencia *</label>
                <select
                    value={juezForm.procedencia}
                    onChange={(e) => setJuezForm(p => ({ ...p, procedencia: e.target.value }))}
                    className="w-full p-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500"
                >
                    {PROCEDENCIAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                    type="checkbox"
                    checked={juezForm.es_principal}
                    onChange={(e) => setJuezForm(p => ({ ...p, es_principal: e.target.checked }))}
                />
                Juez principal
            </label>
            <div className="flex justify-end gap-2 pt-4">
                <Button type="button" onClick={() => setIsJuezModalOpen(false)} variant="secondary">Cancelar</Button>
                <Button type="submit" variant="primary" disabled={submittingJuez}>
                    {submittingJuez ? <LoadingSpinner size="sm" /> : 'Agregar Juez'}
                </Button>
            </div>
          </form>
       </Modal>
    </div>
  );
}
