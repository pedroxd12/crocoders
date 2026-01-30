'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Table from '@/components/ui/Table';
import LoadingSpinner from '@/components/LoadingSpinner';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function MiembrosAdmin() {
  const [miembros, setMiembros] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchMiembros = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const res = await fetch('/api/admin/miembros');
        
        if (!res.ok) throw new Error('Error al cargar miembros');
        
        const data = await res.json();
        setMiembros(data);
      } catch (error) {
        setError(error.message);
        toast.error('Error al cargar miembros');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMiembros();
  }, []);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const filteredMiembros = miembros.filter(miembro =>
    miembro.nombre_completo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    miembro.correo_electronico.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id) => {
    // Verificar si es el último administrador
    const memberToDelete = miembros.find(m => m.id_miembro === id);
    const adminCount = miembros.filter(m => m.tipo === 'administrador').length;
    
    if (memberToDelete?.tipo === 'administrador' && adminCount <= 1) {
      toast.error('No puedes eliminar el último administrador');
      return;
    }

    if (!confirm('¿Estás seguro de eliminar este miembro?')) return;
    
    try {
      const res = await fetch(`/api/admin/miembros?id=${id}`, { 
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al eliminar el miembro');
      }
      
      const result = await res.json();
      
      if (result.success) {
        toast.success('Miembro eliminado correctamente');
        setMiembros(miembros.filter(miembro => miembro.id_miembro !== id));
      } else {
        throw new Error(result.error || 'Error al eliminar el miembro');
      }
    } catch (error) {
      toast.error(error.message);
      console.error('Delete error:', error);
    }
  };

  if (isLoading) {
    return <LoadingSpinner className="my-8" />;
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        Error: {error}
        <button 
          onClick={() => window.location.reload()}
          className="ml-4 bg-blue-500 text-white px-3 py-1 rounded"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Gestión de Miembros</h2>
        <div className="w-1/2">
          <Input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      <Table
        columns={[
          { header: 'Nombre', accessor: 'nombre_completo' },
          { header: 'Correo', accessor: 'correo_electronico' },
          { header: 'Teléfono', accessor: 'numero_telefono' },
          {
            header: 'Plataformas',
            render: (miembro) => (
              <div className="flex space-x-1">
                {miembro.usuario_codeforces && (
                  <span className="bg-blue-600 px-2 py-1 rounded text-xs">CF</span>
                )}
                {miembro.usuario_vjudge && (
                  <span className="bg-green-600 px-2 py-1 rounded text-xs">VJ</span>
                )}
                {miembro.usuario_omegaup && (
                  <span className="bg-purple-600 px-2 py-1 rounded text-xs">OU</span>
                )}
              </div>
            )
          },
          {
            header: 'Rol',
            render: (miembro) => (
              <span className={`px-2 py-1 rounded text-xs ${
                miembro.tipo === 'administrador' ? 'bg-purple-600' : 'bg-blue-600'
              }`}>
                {miembro.tipo}
              </span>
            )
          },
          {
            header: 'Acciones',
            render: (miembro) => (
              <div className="flex space-x-2">
                <Button 
                  onClick={() => handleDelete(miembro.id_miembro)}
                  variant="text"
                  size="sm"
                  color="red"
                >
                  Eliminar
                </Button>
              </div>
            )
          }
        ]}
        data={filteredMiembros}
        emptyMessage="No hay miembros registrados"
      />
    </div>
  );
}