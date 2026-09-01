'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import { Plus, Search, ShieldCheck, Users } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';

export default function GestionAdministradores() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [correo, setCorreo] = useState('');
  const [guardando, setGuardando] = useState(false);
  // { miembro, hacerAdmin } — confirmación pendiente
  const [cambioPendiente, setCambioPendiente] = useState(null);
  const [aplicandoCambio, setAplicandoCambio] = useState(false);
  const { user: currentUser } = useAuth();

  // Misma clave SWR que /admin/miembros: las dos pantallas comparten la caché,
  // así que saltar de una a otra ya no vuelve a pedir la lista entera.
  const { data: miembros = [], error, isLoading, mutate } = useSWR('/api/admin/miembros', fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  const filteredMiembros = miembros.filter((miembro) => {
    const q = searchQuery.toLowerCase();
    return (
      (miembro.nombre_completo || '').toLowerCase().includes(q) ||
      (miembro.correo_electronico || '').toLowerCase().includes(q)
    );
  });

  const totalAdmins = miembros.filter((m) => m.rol === 'administrador' && m.estado === 'activo').length;

  const aplicarCambioRol = async () => {
    if (!cambioPendiente) return;
    const { miembro, hacerAdmin } = cambioPendiente;
    const nuevoRol = hacerAdmin ? 'administrador' : 'usuario';

    setAplicandoCambio(true);
    try {
      const res = await fetch(`/api/admin/miembros/${miembro.id_miembro}/rol`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol: nuevoRol }),
      });
      const data = await res.json().catch(() => ({}));
      // La regla del "último administrador" la decide el servidor dentro de una
      // transacción: el conteo del cliente podía estar desactualizado y dejar el
      // sistema sin ningún admin.
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el rol');

      await mutate(
        (actuales = []) =>
          actuales.map((m) => (m.id_miembro === miembro.id_miembro ? { ...m, rol: data.rol } : m)),
        { revalidate: true },
      );

      setCambioPendiente(null);
      toast.success(`Rol actualizado a ${data.rol}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAplicandoCambio(false);
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await fetch('/api/admin/miembros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo_electronico: correo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al agregar administrador');

      await mutate();
      toast.success('Administrador agregado correctamente');
      setIsModalOpen(false);
      setCorreo('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const columns = [
    { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium' },
    { header: 'Correo', accessor: 'correo_electronico', cellClassName: 'text-muted' },
    {
      header: 'Rol',
      // El color ya no es decorativo: 'administrador' es la excepción que hay
      // que poder localizar de un vistazo, el resto es información neutra.
      render: (m) => (
        <Badge tone={m.rol === 'administrador' ? 'info' : 'neutral'}>{m.rol || 'usuario'}</Badge>
      ),
    },
    {
      header: 'Acciones',
      align: 'right',
      render: (m) => (
        <div className="flex justify-end">
          {/* variant="secondary": antes era variant="outline", que no existía,
              así que el botón salía sin fondo ni borde — dos palabras de color
              suelto que no parecían clicables. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setCambioPendiente({ miembro: m, hacerAdmin: m.rol !== 'administrador' })
            }
            disabled={m.id_miembro === currentUser?.id}
            title={
              m.id_miembro === currentUser?.id
                ? 'No puedes cambiar tu propio rol'
                : undefined
            }
          >
            {m.rol === 'administrador' ? 'Quitar admin' : 'Hacer admin'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administradores"
        description={`Quién puede entrar al panel. Actualmente hay ${totalAdmins} administrador${totalAdmins === 1 ? '' : 'es'} activo${totalAdmins === 1 ? '' : 's'}.`}
        actions={
          <>
            <Input
              type="search"
              aria-label="Buscar miembros"
              placeholder="Buscar por nombre o correo…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search size={16} />}
              wrapperClassName="w-full sm:w-72"
            />
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              Añadir administrador
            </Button>
          </>
        }
      />

      {error && !miembros.length ? (
        <EmptyState
          icon={Users}
          title="No se pudo cargar la lista"
          description="Comprueba tu conexión y vuelve a intentarlo."
        />
      ) : (
        <Table
          columns={columns}
          data={filteredMiembros}
          loading={isLoading && !miembros.length}
          getRowKey={(m) => m.id_miembro}
          emptyMessage={
            <EmptyState
              icon={ShieldCheck}
              title="No se encontraron miembros"
              description="Sólo los miembros ya registrados pueden ser promovidos a administradores."
            />
          }
        />
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Añadir nuevo administrador"
        description="El miembro debe estar ya registrado en la plataforma."
        size="md"
      >
        <form onSubmit={handleAddAdmin} className="space-y-4">
          <Input
            label="Correo electrónico"
            type="email"
            name="correo_electronico"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
            placeholder="nombre@ejemplo.com"
            help="Se buscará el miembro con ese correo y se le dará el rol de administrador."
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" loading={guardando}>
              Guardar
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!cambioPendiente}
        onClose={() => (aplicandoCambio ? null : setCambioPendiente(null))}
        onConfirm={aplicarCambioRol}
        loading={aplicandoCambio}
        tone={cambioPendiente?.hacerAdmin ? 'warning' : 'danger'}
        title={
          cambioPendiente?.hacerAdmin
            ? `¿Hacer administrador a ${cambioPendiente?.miembro?.nombre_completo}?`
            : `¿Quitar el rol de administrador a ${cambioPendiente?.miembro?.nombre_completo}?`
        }
        message={
          cambioPendiente?.hacerAdmin
            ? 'Tendrá acceso completo al panel de administración.'
            : 'Perderá el acceso al panel de administración.'
        }
        consequences={
          cambioPendiente?.hacerAdmin
            ? [
                'Podrá crear, editar y eliminar eventos, programas y evidencias.',
                'Podrá dar de baja miembros y cambiar roles, incluido el tuyo.',
                'El cambio surte efecto en su sesión al volver a iniciar sesión.',
              ]
            : [
                'Dejará de ver el panel /admin por completo.',
                'Si sigue siendo staff de algún evento conservará ese rol, no bajará a usuario.',
                'El sistema no permitirá quitar el rol al último administrador activo.',
              ]
        }
        confirmLabel={cambioPendiente?.hacerAdmin ? 'Hacer administrador' : 'Quitar administrador'}
      />
    </div>
  );
}
