'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Table from '@/components/ui/Table';
import LoadingSpinner from '@/components/LoadingSpinner';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/context/AuthContext';

export default function MiembrosAdmin() {
  const [miembros, setMiembros] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { user: currentUser } = useAuth();

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

  const handleRoleChange = async (id, newRole) => {
    if (id === currentUser?.id) {
        toast.warning("No puedes cambiar tu propio rol");
        return;
    }

    try {
        const res = await fetch('/api/admin/miembros', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_miembro: id, rol: newRole })
        });
        
        if (!res.ok) throw new Error('Error al actualizar rol');
        
        setMiembros(prev => prev.map(m => 
            m.id_miembro === id ? { ...m, rol: newRole } : m
        ));
        toast.success("Rol actualizado");
    } catch (error) {
        toast.error(error.message);
    }
  };

  const handleDelete = async (id) => {
    if (id === currentUser?.id) {
       toast.error("No puedes eliminarte a ti mismo. Pide a otro administrador que lo haga.");
       return; 
    }

    // Verificar si es el último administrador
    const memberToDelete = miembros.find(m => m.id_miembro === id);
    const adminCount = miembros.filter(m => m.rol === 'administrador' && m.estado === 'activo').length;
    
    if (memberToDelete?.rol === 'administrador' && adminCount <= 1) {
      toast.error('No puedes eliminar el último administrador');
      return;
    }

    if (!confirm('¿Estás seguro de eliminar este miembro? Esto lo marcará como "baja".')) return;
    
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
          { header: 'Carrera', accessor: 'carrera' },
          { header: 'Semestre', accessor: 'semestre_actual' },
          { 
            header: 'Afiliación', 
            render: (m) => (
              <div className="flex flex-col gap-1 text-xs">
                {m.es_club_programacion && <span className="text-green-400">Club</span>}
                {m.es_computer_society && (
                  <span className="text-blue-400" title={`IEEE: ${m.numero_ieee || 'N/A'}`}>
                     CS {m.numero_ieee ? `(#${m.numero_ieee})` : ''}
                  </span>
                )}
              </div>
            )
          },
          { header: 'Teléfono', accessor: 'numero_telefono' },
          {
            header: 'Plataformas',
            render: (miembro) => (
              <div className="flex space-x-1">
                {miembro.usuario_codeforces && (
                  <span className="bg-blue-600 px-2 py-1 rounded-xs text-[10px]" title="Codeforces">CF</span>
                )}
                {miembro.usuario_vjudge && (
                  <span className="bg-green-600 px-2 py-1 rounded-xs text-[10px]" title="VJudge">VJ</span>
                )}
                {miembro.usuario_omegaup && (
                  <span className="bg-purple-600 px-2 py-1 rounded-xs text-[10px]" title="OmegaUp">OU</span>
                )}
              </div>
            )
          },
          {
            header: 'Rol',
            render: (miembro) => (
               <select 
                 value={miembro.rol || 'usuario'} 
                 onChange={(e) => handleRoleChange(miembro.id_miembro, e.target.value)}
                 className={`text-xs p-1 rounded border-none focus:ring-1 focus:ring-green-500 cursor-pointer ${
                    miembro.rol === 'administrador' ? 'bg-purple-900/50 text-purple-200' : 'bg-gray-700 text-gray-300'
                 }`}
                 disabled={miembro.id_miembro === currentUser?.id}
               >
                 <option value="usuario">Usuario</option>
                 <option value="administrador">Administrador</option>
               </select>
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