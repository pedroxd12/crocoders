'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Table from '@/components/ui/Table';
import LoadingSpinner from '@/components/LoadingSpinner';
import Button from '@/components/ui/Button';

export default function InvitadosAdmin() {
  const [invitados, setInvitados] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInvitados = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const res = await fetch('/api/admin/invitados');
        
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Error al cargar invitados');
        }
        
        const data = await res.json();
        setInvitados(data);
      } catch (error) {
        setError(error.message);
        toast.error('Error al cargar invitados');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvitados();
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este invitado? Esta acción no se puede deshacer.')) return;
    
    try {
      const res = await fetch(`/api/admin/invitados?id=${id}`, { 
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al eliminar el invitado');
      }
      
      const result = await res.json();
      
      if (result.success) {
        toast.success('Invitado eliminado correctamente');
        setInvitados(invitados.filter(invitado => invitado.id_invitado !== id));
      } else {
        throw new Error(result.error || 'Error al eliminar el invitado');
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
      <h2 className="text-xl font-bold mb-6">Gestión de Invitados</h2>
      
      <Table
        columns={[
          { header: 'Nombre', accessor: 'nombre_completo' },
          { header: 'Correo', accessor: 'correo_electronico' },
          { header: 'Teléfono', accessor: 'numero_telefono' },
          { header: 'Carrera', accessor: 'carrera' },
          { header: 'Semestre', accessor: 'semestre' },
          {
            header: 'Acciones',
            render: (invitado) => (
              <Button 
                onClick={() => handleDelete(invitado.id_invitado)}
                variant="text"
                size="sm"
                color="red"
              >
                Eliminar
              </Button>
            )
          }
        ]}
        data={invitados}
        emptyMessage="No hay invitados registrados"
      />
    </div>
  );
}