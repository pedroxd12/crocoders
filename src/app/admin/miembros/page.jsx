'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import { Search, Trash2, RotateCcw, Users } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import Table from '@/components/ui/Table';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import IconButton from '@/components/ui/IconButton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';

// 'egresado' existe en la base de datos y es el estado natural de quien se
// gradúa, pero el panel no tenía forma de asignarlo: sólo se podía elegir entre
// 'inactivo' y 'baja'. La 'baja' no está aquí porque es destructiva y va por la
// acción de eliminar, con su confirmación.
const ESTADOS = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
  { value: 'egresado', label: 'Egresado' },
];

// 'staff' NO se elige a mano: significa "tiene asignaciones en staff_evento" y
// lo ponen y lo quitan los endpoints de staff del evento. Ofrecerlo aquí
// permitía marcar como staff a alguien sin ninguna asignación que lo respalde
// (y el servidor lo aceptaría, porque es un rol válido), rompiendo el
// invariante rol↔staff_evento. Sólo aparece como opción para quien YA lo es,
// para que su fila no se pinte con el desplegable vacío.
const ROLES = [
  { value: 'usuario', label: 'Usuario' },
  { value: 'administrador', label: 'Administrador' },
];

const ROLES_CON_STAFF = [
  { value: 'usuario', label: 'Usuario' },
  { value: 'staff', label: 'Staff (asignado a un evento)' },
  { value: 'administrador', label: 'Administrador' },
];

// El color de la etiqueta de estado significa algo: activo es el estado sano,
// baja es una salida, el resto es informativo.
const TONO_ESTADO = {
  activo: 'success',
  baja: 'danger',
  inactivo: 'warning',
  egresado: 'info',
};

export default function MiembrosAdmin() {
  const [searchQuery, setSearchQuery] = useState('');
  const [incluirBajas, setIncluirBajas] = useState(false);
  const [aEliminar, setAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const { user: currentUser } = useAuth();

  // SWR en lugar de useState+useEffect: al volver a esta sección la tabla se
  // pinta al instante desde la caché y se revalida detrás. `keepPreviousData`
  // evita además que la tabla se vacíe al cambiar el filtro de bajas.
  const url = `/api/admin/miembros${incluirBajas ? '?incluirBajas=1' : ''}`;
  const { data: miembros = [], error, isLoading, mutate } = useSWR(url, fetcher, {
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

  const handleRoleChange = async (miembro, nuevoRol) => {
    if (miembro.id_miembro === currentUser?.id) {
      toast.warning('No puedes cambiar tu propio rol');
      return;
    }

    // Un único endpoint de cambio de rol para todo el panel (antes esta pantalla
    // usaba PUT /api/admin/miembros y /admin/admins otro distinto, con reglas
    // incompatibles sobre el último administrador).
    try {
      const res = await fetch(`/api/admin/miembros/${miembro.id_miembro}/rol`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol: nuevoRol }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el rol');

      // Revalidar sin vaciar la tabla: la fila cambia en sitio y el servidor
      // confirma después.
      await mutate(
        (actuales = []) =>
          actuales.map((m) => (m.id_miembro === miembro.id_miembro ? { ...m, rol: data.rol } : m)),
        { revalidate: true },
      );

      if (data.ajustado) {
        toast.info(`Guardado como "${data.rol}": el miembro sigue asignado como staff de algún evento.`);
      } else {
        toast.success('Rol actualizado');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const pedirBaja = (miembro) => {
    if (miembro.id_miembro === currentUser?.id) {
      toast.error('No puedes darte de baja a ti mismo. Pide a otro administrador que lo haga.');
      return;
    }
    setAEliminar(miembro);
  };

  const confirmarBaja = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      const res = await fetch(`/api/admin/miembros?id=${aEliminar.id_miembro}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al dar de baja al miembro');

      toast.success('Miembro dado de baja correctamente');
      setAEliminar(null);
      // La baja es LÓGICA: si la vista incluye bajas, la fila se queda y cambia
      // de estado; si no, desaparece. Antes se filtraba siempre en memoria y el
      // miembro reaparecía intacto al recargar.
      await mutate();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setEliminando(false);
    }
  };

  // Cambio de estado (incluye reactivar una baja: es el único camino de vuelta,
  // sin él "Mostrar bajas" enseñaba filas que ya no se podían recuperar).
  const cambiarEstado = async (miembro, nuevoEstado) => {
    try {
      const res = await fetch('/api/admin/miembros', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_miembro: miembro.id_miembro, estado: nuevoEstado }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el estado');

      await mutate(
        (actuales = []) =>
          actuales.map((m) => (m.id_miembro === miembro.id_miembro ? { ...m, estado: nuevoEstado } : m)),
        { revalidate: true },
      );
      toast.success(nuevoEstado === 'activo' ? 'Miembro reactivado' : 'Estado actualizado');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const columns = [
    { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium' },
    { header: 'Correo', accessor: 'correo_electronico', cellClassName: 'text-muted' },
    { header: 'Carrera', accessor: 'carrera', cellClassName: 'text-muted' },
    { header: 'Semestre', accessor: 'semestre_actual', align: 'center' },
    {
      header: 'Afiliación',
      render: (m) => (
        <div className="flex flex-wrap gap-1">
          {m.es_club_programacion && <Badge tone="success" size="sm">Club</Badge>}
          {m.es_computer_society && (
            <Badge tone="info" size="sm" title={`IEEE: ${m.numero_ieee || 'sin número'}`}>
              CS{m.numero_ieee ? ` #${m.numero_ieee}` : ''}
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Plataformas',
      render: (m) => (
        <div className="flex flex-wrap gap-1">
          {m.usuario_codeforces && <Badge size="sm" title={`Codeforces: ${m.usuario_codeforces}`}>CF</Badge>}
          {m.usuario_vjudge && <Badge size="sm" title={`VJudge: ${m.usuario_vjudge}`}>VJ</Badge>}
          {m.usuario_omegaup && <Badge size="sm" title={`omegaUp: ${m.usuario_omegaup}`}>OU</Badge>}
        </div>
      ),
    },
    {
      header: 'Estado',
      // Una baja no se edita desde el desplegable: se recupera con el botón de
      // reactivar, para que el cambio destructivo y el de vuelta sean explícitos.
      render: (m) =>
        m.estado === 'baja' ? (
          <Badge tone={TONO_ESTADO.baja}>baja</Badge>
        ) : (
          // Sin `className` de tamaño: Tailwind ordena las utilidades por su
          // escala, no por el orden en que se escriben, así que un `py-1.5`
          // añadido aquí NUNCA gana al `py-2.5` base del campo. Mejor que el
          // control mida lo mismo que en el resto del panel a que arrastre
          // clases muertas que aparentan hacer algo.
          <Select
            aria-label={`Estado de ${m.nombre_completo}`}
            value={m.estado || 'activo'}
            onChange={(e) => cambiarEstado(m, e.target.value)}
            options={ESTADOS}
            required
            placeholder="Estado"
            wrapperClassName="min-w-[8rem]"
          />
        ),
    },
    {
      header: 'Rol',
      render: (m) => (
        <Select
          aria-label={`Rol de ${m.nombre_completo}`}
          value={m.rol || 'usuario'}
          onChange={(e) => handleRoleChange(m, e.target.value)}
          options={m.rol === 'staff' ? ROLES_CON_STAFF : ROLES}
          required
          placeholder="Rol"
          wrapperClassName="min-w-[9rem]"
          disabled={m.id_miembro === currentUser?.id}
        />
      ),
    },
    {
      header: 'Acciones',
      align: 'right',
      render: (m) =>
        m.estado === 'baja' ? (
          <div className="flex justify-end">
            <IconButton
              icon={RotateCcw}
              label={`Reactivar a ${m.nombre_completo}`}
              tone="brand"
              onClick={() => cambiarEstado(m, 'activo')}
            />
          </div>
        ) : (
          <div className="flex justify-end">
            <IconButton
              icon={Trash2}
              label={`Dar de baja a ${m.nombre_completo}`}
              tone="danger"
              onClick={() => pedirBaja(m)}
            />
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Miembros"
        description="Altas, bajas y roles de los miembros del club."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={incluirBajas}
                onChange={(e) => setIncluirBajas(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              Mostrar bajas
            </label>
            <Input
              type="search"
              aria-label="Buscar miembros"
              placeholder="Buscar por nombre o correo…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search size={16} />}
              wrapperClassName="w-full sm:w-72"
            />
          </>
        }
      />

      {error && !miembros.length ? (
        <EmptyState
          icon={Users}
          title="No se pudo cargar la lista de miembros"
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
              icon={Users}
              title={searchQuery ? 'Ningún miembro coincide con la búsqueda' : 'Todavía no hay miembros'}
              description={
                searchQuery
                  ? 'Prueba con otro nombre o correo.'
                  : 'Los miembros aparecen aquí en cuanto se registran en la plataforma.'
              }
            />
          }
        />
      )}

      <ConfirmDialog
        isOpen={!!aEliminar}
        onClose={() => (eliminando ? null : setAEliminar(null))}
        onConfirm={confirmarBaja}
        loading={eliminando}
        title={`¿Dar de baja a ${aEliminar?.nombre_completo || 'este miembro'}?`}
        message="La baja es lógica: el historial se conserva, pero el miembro deja de aparecer en los listados y en el ranking."
        consequences={[
          'Deja de contar como miembro activo en las estadísticas del club.',
          'Desaparece del ranking público de puntajes.',
          'No podrá iniciar sesión ni inscribirse a nuevos eventos.',
          'Podrás reactivarlo desde el filtro "Mostrar bajas".',
        ]}
        confirmLabel="Dar de baja"
      />
    </div>
  );
}
