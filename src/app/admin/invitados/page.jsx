'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import { Search, Trash2, UserPlus } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import Table from '@/components/ui/Table';
import Input from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import IconButton from '@/components/ui/IconButton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function InvitadosAdmin() {
  const [searchTerm, setSearchTerm] = useState('');
  const [aEliminar, setAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const { data: invitados = [], error, isLoading, mutate } = useSWR('/api/admin/invitados', fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  const filteredInvitados = invitados.filter((invitado) => {
    const q = searchTerm.toLowerCase();
    return (
      (invitado.nombre_completo || '').toLowerCase().includes(q) ||
      (invitado.correo_electronico || '').toLowerCase().includes(q)
    );
  });

  const confirmarEliminacion = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      const res = await fetch(`/api/admin/invitados?id=${aEliminar.id_invitado}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al eliminar el invitado');
      }

      toast.success('Invitado eliminado correctamente');
      setAEliminar(null);
      // Refresco desde el servidor en vez de filtrar en memoria: si el borrado
      // no fue el que creíamos, la tabla lo refleja.
      await mutate();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setEliminando(false);
    }
  };

  const columns = [
    { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium' },
    { header: 'Correo', accessor: 'correo_electronico', cellClassName: 'text-muted' },
    {
      header: 'Institución',
      render: (i) => (
        <div>
          <p className="text-fg">{i.escuela_institucion || 'Sin especificar'}</p>
          {i.nivel_estudios && <p className="text-xs capitalize text-muted">{i.nivel_estudios}</p>}
        </div>
      ),
    },
    { header: 'Carrera', accessor: 'carrera', cellClassName: 'text-muted' },
    { header: 'Semestre', accessor: 'semestre', align: 'center' },
    {
      header: 'Acciones',
      align: 'right',
      render: (invitado) => (
        <div className="flex justify-end">
          <IconButton
            icon={Trash2}
            label={`Eliminar a ${invitado.nombre_completo}`}
            tone="danger"
            onClick={() => setAEliminar(invitado)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invitados"
        description="Personas ajenas al club que se han inscrito a eventos abiertos."
        actions={
          <Input
            type="search"
            aria-label="Buscar invitados"
            placeholder="Buscar por nombre o correo…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={<Search size={16} />}
            wrapperClassName="w-full sm:w-72"
          />
        }
      />

      {error && !invitados.length ? (
        <EmptyState
          icon={UserPlus}
          title="No se pudo cargar la lista de invitados"
          description="Comprueba tu conexión y vuelve a intentarlo."
        />
      ) : (
        <Table
          columns={columns}
          data={filteredInvitados}
          // `loading` sólo la primera vez: en las revalidaciones la tabla
          // conserva los datos que ya estaban en pantalla.
          loading={isLoading && !invitados.length}
          getRowKey={(i) => i.id_invitado}
          emptyMessage={
            <EmptyState
              icon={UserPlus}
              title={searchTerm ? 'Ningún invitado coincide con la búsqueda' : 'Todavía no hay invitados'}
              description={
                searchTerm
                  ? 'Prueba con otro nombre o correo.'
                  : 'Aparecen aquí en cuanto alguien externo se inscribe a un evento.'
              }
            />
          }
        />
      )}

      <ConfirmDialog
        isOpen={!!aEliminar}
        onClose={() => (eliminando ? null : setAEliminar(null))}
        onConfirm={confirmarEliminacion}
        loading={eliminando}
        title={`¿Eliminar a ${aEliminar?.nombre_completo || 'este invitado'}?`}
        message="Se borra el registro del invitado del sistema."
        consequences={[
          'Se pierden sus datos de contacto (correo, institución, carrera).',
          'Sus inscripciones a eventos dejan de tener una persona asociada.',
          'Si vuelve a inscribirse tendrá que rellenar sus datos otra vez.',
        ]}
        confirmLabel="Eliminar invitado"
      />
    </div>
  );
}
