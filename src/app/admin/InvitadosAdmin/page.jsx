'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Table from '@/components/ui/Table';
import LoadingSpinner from '@/components/LoadingSpinner';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { FaUserFriends, FaSearch, FaTrash } from 'react-icons/fa';

export default function InvitadosAdmin() {
  const [invitados, setInvitados] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchInvitados();
  }, []);

  const fetchInvitados = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/invitados');
      if (!res.ok) throw new Error('Error al cargar invitados');
      const data = await res.json();
      setInvitados(data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este invitado?')) return;
    
    try {
      const res = await fetch(`/api/admin/invitados?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar el invitado');
      
      toast.success('Invitado eliminado correctamente');
      setInvitados(invitados.filter(invitado => invitado.id_invitado !== id));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const filteredInvitados = invitados.filter(invitado => 
    invitado.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invitado.correo_electronico.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return <div className="flex justify-center h-screen items-center"><LoadingSpinner text="Cargando invitados..." /></div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FaUserFriends /> Gestión de Invitados
        </h2>
        <Input
            type="text"
            placeholder="Buscar invitados..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-64 bg-gray-700 border-gray-600 focus:border-green-500"
            icon={<FaSearch className="text-gray-400"/>}
        />
      </div>
      
      <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <Table
          columns={[
            { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium text-white py-3 px-4' },
            { header: 'Correo', accessor: 'correo_electronico', cellClassName: 'text-gray-400 text-sm py-3 px-4' },
            { 
               header: 'Institución', 
               render: (i) => (
                  <div className="text-sm">
                     <div className="text-white">{i.escuela_institucion || 'N/A'}</div>
                     <div className="text-xs text-gray-400 capitalize">{i.nivel_estudios}</div>
                  </div>
               ),
               cellClassName: 'py-3 px-4' 
            },
            { header: 'Carrera', accessor: 'carrera', cellClassName: 'text-sm text-gray-300 py-3 px-4' },
            { header: 'Semestre', accessor: 'semestre', cellClassName: 'text-center text-sm py-3 px-4' },
            {
              header: 'Acciones',
              render: (invitado) => (
                <div className="flex justify-end px-4">
                    <Button onClick={() => handleDelete(invitado.id_invitado)} variant="text" size="sm" className="text-red-400 hover:text-red-300" title="Eliminar"><FaTrash /></Button>
                </div>
              ),
              cellClassName: 'text-right'
            }
          ]}
          data={filteredInvitados}
          emptyMessage={<div className="text-center py-8 text-gray-400">No hay invitados registrados</div>}
          className="w-full"
          headerClassName="bg-gray-700 text-gray-300"
          rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
        />
      </div>
    </div>
  );
}
