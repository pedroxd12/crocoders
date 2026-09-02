'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import { ArrowLeft, Trash2, UserPlus, ShieldUser, Gavel } from 'lucide-react';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { fetcher } from '@/lib/fetcher';
import { nivelDeRol, ETIQUETA_NIVEL, TONO_NIVEL, DESCRIPCION_NIVEL, NIVEL_STAFF } from '@/lib/roles-staff';

const PROCEDENCIAS = [
  { value: 'club_programacion', label: 'Miembro del Club de Programación' },
  { value: 'computer_society', label: 'Asociación (IEEE / Computer Society)' },
  { value: 'itlac', label: 'Universidad (ITLAC)' },
  { value: 'universitario', label: 'Universitario externo' },
  { value: 'preparatoria', label: 'Estudiante de preparatoria' },
  { value: 'otro', label: 'Otro' },
];
const procedenciaLabel = (v) => PROCEDENCIAS.find((p) => p.value === v)?.label || v;

const JUEZ_VACIO = {
  id_miembro: '',
  nombre_completo: '',
  correo_electronico: '',
  numero_telefono: '',
  institucion: '',
  procedencia: 'otro',
  es_principal: false,
};

export default function EventoStaff() {
  const { id } = useParams();
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isJuezModalOpen, setIsJuezModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [juezForm, setJuezForm] = useState(JUEZ_VACIO);
  const [submittingJuez, setSubmittingJuez] = useState(false);
  const [staffAEliminar, setStaffAEliminar] = useState(null);
  const [juezAEliminar, setJuezAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  // El nombre del evento en la cabecera: sin él la pantalla sólo decía "Staff
  // del evento" y la única pista de en cuál estabas era el id de la URL.
  const { data: evento } = useSWR(id ? `/api/admin/eventos/${id}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const { data: staff, isLoading: cargandoStaff, mutate: mutarStaff } = useSWR(
    id ? `/api/admin/eventos/${id}/staff` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: jueces, isLoading: cargandoJueces, mutate: mutarJueces } = useSWR(
    id ? `/api/admin/eventos/${id}/jueces` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: catalogos } = useSWR('/api/admin/catalogos', fetcher, { revalidateOnFocus: false });

  // El catálogo de miembros sólo se descarga cuando hace falta poblar un
  // desplegable, no en cada visita a la pantalla.
  const { data: usuarios } = useSWR(
    isModalOpen || isJuezModalOpen ? '/api/admin/users' : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const listaStaff = useMemo(() => (Array.isArray(staff) ? staff : []), [staff]);
  const listaJueces = useMemo(() => (Array.isArray(jueces) ? jueces : []), [jueces]);
  const roles = catalogos?.roles ?? [];
  // Qué concede el rol elegido, dicho ANTES de asignarlo: el catálogo tiene
  // tres banderas y sólo el nombre no explica si la persona podrá escanear,
  // validar pagos o sólo mirar (src/lib/roles-staff.js).
  const rolSeleccionado = roles.find((r) => String(r.id_rol) === String(selectedRole)) || null;
  const availableMembers = useMemo(
    () => (Array.isArray(usuarios) ? usuarios.filter((u) => u.tipo === 'miembro') : []),
    [usuarios],
  );
  const membersNotInStaff = useMemo(
    () => availableMembers.filter((m) => !listaStaff.some((s) => s.id_miembro === m.id)),
    [availableMembers, listaStaff],
  );

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!selectedMember || !selectedRole) {
      toast.warning('Selecciona miembro y rol');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/eventos/${id}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_miembro: selectedMember, id_rol: selectedRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al agregar');
      }
      toast.success('Staff agregado correctamente');
      setIsModalOpen(false);
      setSelectedMember('');
      setSelectedRole('');
      mutarStaff();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmarEliminarStaff = async () => {
    if (!staffAEliminar) return;
    setEliminando(true);
    try {
      const res = await fetch(`/api/admin/eventos/${id}/staff?id_staff=${staffAEliminar.id_staff}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar');
      toast.success('Eliminado del staff');
      setStaffAEliminar(null);
      mutarStaff();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEliminando(false);
    }
  };

  const handleJuezMemberChange = (e) => {
    const memberId = e.target.value;
    const member = availableMembers.find((m) => String(m.id) === String(memberId));
    setJuezForm((prev) => ({
      ...prev,
      id_miembro: memberId,
      nombre_completo: member ? member.nombre_completo : prev.nombre_completo,
      correo_electronico: member ? member.email || '' : prev.correo_electronico,
      // Si es miembro del sistema, su procedencia por defecto es el club.
      procedencia: member ? 'club_programacion' : prev.procedencia,
    }));
  };

  const handleAddJuez = async (e) => {
    e.preventDefault();
    if (!juezForm.nombre_completo.trim()) {
      toast.warning('El nombre del juez es obligatorio');
      return;
    }
    setSubmittingJuez(true);
    try {
      const res = await fetch(`/api/admin/eventos/${id}/jueces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...juezForm, id_miembro: juezForm.id_miembro || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al agregar juez');
      }
      toast.success('Juez agregado correctamente');
      setIsJuezModalOpen(false);
      setJuezForm(JUEZ_VACIO);
      mutarJueces();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmittingJuez(false);
    }
  };

  const confirmarEliminarJuez = async () => {
    if (!juezAEliminar) return;
    setEliminando(true);
    try {
      const res = await fetch(`/api/admin/eventos/${id}/jueces?id_juez=${juezAEliminar.id_juez}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar');
      toast.success('Juez eliminado');
      setJuezAEliminar(null);
      mutarJueces();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a eventos
      </Button>

      <PageHeader
        title={evento?.nombre ?? 'Staff del evento'}
        description="Quién organiza el evento y quién lo juzga."
      />

      {/* Las dos mitades de la pantalla son secciones hermanas: cada una lleva
          su <h2> con su acción al lado. El <h1> es el de PageHeader y sólo hay
          uno, que es lo que se estaba corrigiendo. */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-fg">Equipo organizador</h2>
          <p className="mt-1 text-sm text-muted">
            Miembros con acceso al panel de staff de este evento. Lo que cada uno puede hacer lo decide su rol:
            solo consulta, operación (escáner QR y pagos) o gestión (marcas a mano).
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="shrink-0">
          <UserPlus size={16} aria-hidden="true" /> Agregar staff
        </Button>
      </div>

      <Table
        columns={[
          { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium' },
          { header: 'Correo', accessor: 'correo_electronico', cellClassName: 'text-muted' },
          { header: 'Rol', render: (row) => <Badge tone="info">{row.rol_nombre}</Badge> },
          {
            header: 'Permisos',
            render: (row) => {
              const nivel = nivelDeRol(row);
              return (
                <Badge tone={TONO_NIVEL[nivel]} title={DESCRIPCION_NIVEL[nivel]}>
                  {ETIQUETA_NIVEL[nivel]}
                </Badge>
              );
            },
          },
          {
            header: 'Acciones',
            align: 'right',
            render: (row) => (
              <IconButton
                icon={Trash2}
                label={`Quitar a ${row.nombre_completo} del staff`}
                tone="danger"
                onClick={() => setStaffAEliminar(row)}
              />
            ),
          },
        ]}
        data={listaStaff}
        getRowKey={(row) => row.id_staff}
        loading={cargandoStaff && !staff}
        emptyMessage={
          <EmptyState
            icon={ShieldUser}
            title="Sin staff asignado"
            description="Asigna a los miembros que organizarán y darán acceso a este evento."
            action={
              <Button onClick={() => setIsModalOpen(true)}>
                <UserPlus size={16} aria-hidden="true" /> Agregar staff
              </Button>
            }
          />
        }
      />

      <div className="mt-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-fg">Jueces del evento</h2>
            <p className="mt-1 text-sm text-muted">Personas que evaluarán a los participantes.</p>
          </div>
          <Button onClick={() => setIsJuezModalOpen(true)} className="shrink-0">
            <UserPlus size={16} aria-hidden="true" /> Agregar juez
          </Button>
        </div>

        <Table
          columns={[
            { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium' },
            { header: 'Correo', accessor: 'correo_electronico', cellClassName: 'text-muted' },
            { header: 'Institución', accessor: 'institucion', cellClassName: 'text-muted' },
            {
              header: 'Procedencia',
              render: (row) => <Badge tone="neutral">{procedenciaLabel(row.procedencia)}</Badge>,
            },
            {
              header: 'Principal',
              align: 'center',
              render: (row) =>
                row.es_principal ? (
                  <Badge tone="success">Principal</Badge>
                ) : (
                  <span className="text-faint">—</span>
                ),
            },
            {
              header: 'Acciones',
              align: 'right',
              render: (row) => (
                <IconButton
                  icon={Trash2}
                  label={`Eliminar al juez ${row.nombre_completo}`}
                  tone="danger"
                  onClick={() => setJuezAEliminar(row)}
                />
              ),
            },
          ]}
          data={listaJueces}
          getRowKey={(row) => row.id_juez}
          loading={cargandoJueces && !jueces}
          emptyMessage={
            <EmptyState
              icon={Gavel}
              title="Sin jueces asignados"
              description="Añade jueces internos o externos para evaluar el concurso."
            />
          }
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Agregar miembro al staff"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="formulario-staff" loading={isSubmitting}>
              Agregar
            </Button>
          </>
        }
      >
        <form id="formulario-staff" onSubmit={handleAddStaff} className="space-y-4">
          <Select
            label="Miembro"
            name="id_miembro"
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
            required
            placeholder={usuarios ? 'Seleccionar miembro' : 'Cargando miembros…'}
            options={membersNotInStaff.map((m) => ({
              value: m.id,
              label: `${m.nombre_completo} (${m.email})`,
            }))}
          />
          <Select
            label="Rol"
            name="id_rol"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            required
            placeholder="Seleccionar rol"
            options={roles.map((r) => ({
              value: r.id_rol,
              label: `${r.nombre} · ${ETIQUETA_NIVEL[nivelDeRol(r)]}`,
            }))}
            help={
              rolSeleccionado
                ? DESCRIPCION_NIVEL[nivelDeRol(rolSeleccionado)]
                : 'El rol determina qué puede hacer esta persona durante el evento.'
            }
          />
          <dl className="space-y-1.5 rounded-lg border border-line bg-surface-2 p-3 text-xs">
            {Object.values(NIVEL_STAFF).map((nivel) => (
              <div key={nivel} className="flex gap-2">
                <dt className="shrink-0">
                  <Badge tone={TONO_NIVEL[nivel]}>{ETIQUETA_NIVEL[nivel]}</Badge>
                </dt>
                <dd className="text-muted">{DESCRIPCION_NIVEL[nivel]}</dd>
              </div>
            ))}
          </dl>
        </form>
      </Modal>

      <Modal
        isOpen={isJuezModalOpen}
        onClose={() => setIsJuezModalOpen(false)}
        title="Agregar juez"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsJuezModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="formulario-juez" loading={submittingJuez}>
              Agregar juez
            </Button>
          </>
        }
      >
        <form id="formulario-juez" onSubmit={handleAddJuez} className="space-y-4">
          <Select
            label="¿Es miembro del club?"
            name="id_miembro"
            value={juezForm.id_miembro}
            onChange={handleJuezMemberChange}
            placeholder="Juez externo (capturar datos)"
            options={availableMembers.map((m) => ({
              value: m.id,
              label: `${m.nombre_completo} (${m.email})`,
            }))}
            help="Al elegir un miembro se rellenan su nombre y correo automáticamente."
          />
          <Input
            label="Nombre completo"
            name="nombre_completo"
            value={juezForm.nombre_completo}
            onChange={(e) => setJuezForm((p) => ({ ...p, nombre_completo: e.target.value }))}
            required
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Correo"
              type="email"
              name="correo_electronico"
              value={juezForm.correo_electronico}
              onChange={(e) => setJuezForm((p) => ({ ...p, correo_electronico: e.target.value }))}
            />
            <Input
              label="Teléfono"
              name="numero_telefono"
              value={juezForm.numero_telefono}
              onChange={(e) => setJuezForm((p) => ({ ...p, numero_telefono: e.target.value }))}
            />
          </div>
          <Input
            label="Institución"
            name="institucion"
            value={juezForm.institucion}
            onChange={(e) => setJuezForm((p) => ({ ...p, institucion: e.target.value }))}
          />
          <Select
            label="Procedencia"
            name="procedencia"
            value={juezForm.procedencia}
            onChange={(e) => setJuezForm((p) => ({ ...p, procedencia: e.target.value }))}
            required
            placeholder="Seleccionar procedencia"
            options={PROCEDENCIAS}
          />
          <div className="flex items-center gap-2">
            <input
              id="es_principal"
              type="checkbox"
              checked={juezForm.es_principal}
              onChange={(e) => setJuezForm((p) => ({ ...p, es_principal: e.target.checked }))}
              className="h-4 w-4 accent-brand"
            />
            <label htmlFor="es_principal" className="cursor-pointer text-sm font-medium text-fg">
              Juez principal
            </label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(staffAEliminar)}
        onClose={() => setStaffAEliminar(null)}
        onConfirm={confirmarEliminarStaff}
        loading={eliminando}
        title={`Quitar a ${staffAEliminar?.nombre_completo ?? ''} del staff`}
        message="Dejará de tener permisos sobre este evento."
        consequences={[
          'Perderá el acceso al panel de staff y al escaneo de asistencia de este evento',
          'Su rol general en el club puede cambiar si este era su único evento asignado',
        ]}
        confirmLabel="Quitar del staff"
      />

      <ConfirmDialog
        isOpen={Boolean(juezAEliminar)}
        onClose={() => setJuezAEliminar(null)}
        onConfirm={confirmarEliminarJuez}
        loading={eliminando}
        title={`Eliminar al juez ${juezAEliminar?.nombre_completo ?? ''}`}
        message="Se borra su ficha de jurado en este evento."
        consequences={['Los datos capturados del juez (correo, teléfono, institución)']}
        confirmLabel="Eliminar juez"
      />
    </div>
  );
}
