'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Table from '@/components/ui/Table';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function GestionAdministradores() {
  const [miembros, setMiembros] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    correo_electronico: ''
  });

  useEffect(() => {
    fetchMiembros();
  }, []);

  const fetchMiembros = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/miembros');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al cargar miembros');
      }
      
      const data = await res.json();
      setMiembros(data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const filteredMiembros = miembros.filter(miembro =>
    miembro.nombre_completo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    miembro.correo_electronico.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRoleChange = async (id, makeAdmin) => {
    // Verificar si es el último administrador
    const adminCount = miembros.filter(m => m.tipo === 'administrador').length;
    const isLastAdmin = adminCount <= 1 && !makeAdmin;
    
    if (isLastAdmin) {
      toast.error('Debe haber al menos un administrador en el sistema');
      return;
    }

    if (!confirm(`¿Está seguro que desea ${makeAdmin ? 'hacer' : 'quitar'} administrador a este usuario?`)) return;
    
    try {
      const res = await fetch(`/api/admin/miembros/${id}/rol`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: makeAdmin ? 'administrador' : 'usuario' })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Error al ${makeAdmin ? 'promover' : 'degradar'} usuario`);
      }
      
      const updatedUser = await res.json();
      
      // Actualizar el estado local
      setMiembros(miembros.map(m => 
        m.id_miembro === updatedUser.id_miembro ? { ...m, tipo: updatedUser.tipo } : m
      ));
      
      toast.success(`Rol actualizado correctamente a ${updatedUser.tipo}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    
    try {
      const res = await fetch('/api/admin/miembros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al agregar administrador');
      }
      
      const newAdmin = await res.json();
      
      // Actualizar el estado local
      setMiembros([...miembros, newAdmin]);
      
      toast.success('Administrador agregado correctamente');
      setIsModalOpen(false);
      setFormData({ correo_electronico: '' });
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (isLoading) {
    return <LoadingSpinner className="my-8" />;
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <Input
          type="text"
          placeholder="Buscar por nombre o correo..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="w-full md:w-1/2"
        />
      </div>

      <div className="bg-gray-800 rounded-lg shadow overflow-hidden">
        <Table
          columns={[
            { 
              header: 'Nombre', 
              accessor: 'nombre_completo',
              cellClassName: 'font-medium text-gray-100'
            },
            { 
              header: 'Correo', 
              accessor: 'correo_electronico',
              cellClassName: 'text-gray-400'
            },
            {
              header: 'Rol',
              render: (miembro) => (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                  miembro.tipo === 'administrador' 
                    ? 'bg-purple-600 text-purple-100' 
                    : 'bg-blue-600 text-blue-100'
                }`}>
                  {miembro.tipo}
                </span>
              )
            },
            {
              header: 'Acciones',
              render: (miembro) => (
                <div className="flex space-x-2">
                  {miembro.tipo === 'administrador' ? (
                    <Button 
                      onClick={() => handleRoleChange(miembro.id_miembro, false)}
                      variant="outline"
                      size="sm"
                      className="text-yellow-400 border-yellow-400 hover:bg-yellow-500/10"
                    >
                      Quitar Admin
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => handleRoleChange(miembro.id_miembro, true)}
                      variant="outline"
                      size="sm"
                      className="text-purple-400 border-purple-400 hover:bg-purple-500/10"
                    >
                      Hacer Admin
                    </Button>
                  )}
                </div>
              )
            }
          ]}
          data={filteredMiembros}
          emptyMessage="No se encontraron miembros"
          className="bg-gray-800"
          headerClassName="bg-gray-700 text-gray-300"
          rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Añadir Nuevo Administrador"
        className="bg-gray-800 text-gray-100"
      >
        <form onSubmit={handleAddAdmin}>
          <div className="mb-6">
            <Input
              label="Correo Electrónico"
              type="email"
              name="correo_electronico"
              value={formData.correo_electronico}
              onChange={(e) => setFormData({...formData, correo_electronico: e.target.value})}
              required
              className="bg-gray-700 border-gray-600 focus:border-purple-500"
              labelClassName="text-gray-300"
            />
            <p className="mt-1 text-sm text-gray-400">
              Ingrese el correo electrónico del miembro que desea hacer administrador
            </p>
          </div>

          <div className="flex justify-end space-x-4">
            <Button 
              type="button"
              onClick={() => setIsModalOpen(false)}
              variant="secondary"
              className="bg-gray-700 hover:bg-gray-600"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              variant="primary"
              className="bg-purple-600 hover:bg-purple-700"
            >
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}