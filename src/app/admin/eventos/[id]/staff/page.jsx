
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaArrowLeft, FaTrash, FaUserPlus, FaUserShield } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/LoadingSpinner';

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

  useEffect(() => {
    Promise.all([
        fetchStaff(),
        fetchCatalogs(),
        fetchMembers()
    ]).finally(() => setLoading(false));
  }, [id]);

  const fetchStaff = async () => {
    try {
        const res = await fetch(`/api/admin/eventos/${id}/staff`);
        if (res.ok) setStaff(await res.json());
    } catch (error) {
        console.error(error);
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
      } catch (error) { console.error(error); }
  };

  const fetchMembers = async () => {
      try {
          // Temporarily use users endpoint, filtering for members on client or if specific endpoint exists
          const res = await fetch('/api/admin/users'); 
          if (res.ok) {
              const data = await res.json();
              // Filter only members, no guests can be staff usually
              setAvailableMembers(data.filter(u => u.tipo === 'miembro')); 
          }
      } catch (error) { console.error(error); }
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

  // Filter out members already in staff
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
    </div>
  );
}
