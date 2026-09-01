'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Check, Search, UserPlus, QrCode, Users, UserRoundCheck,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import QRScannerModal from '@/components/QRScannerModal';
import { fetcher } from '@/lib/fetcher';
import { formatearFechaDia } from '@/lib/fechas';

export default function EventoAsistentes() {
  const { id } = useParams();
  const router = useRouter();

  // El evento se pide por su propia vía. Antes el nombre y la fecha salían de
  // `data[0]` de la lista de asistentes, así que un evento sin inscritos se
  // quedaba sin cabecera y no había forma de saber en cuál estabas.
  const { data: evento } = useSWR(id ? `/api/admin/eventos/${id}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const {
    data: asistentes,
    isLoading,
    mutate: mutarAsistentes,
  } = useSWR(id ? `/api/admin/eventos/${id}/asistentes` : null, fetcher, {
    revalidateOnFocus: false,
    onError: () => toast.error('Error al cargar la lista de asistentes'),
  });

  const lista = useMemo(() => (Array.isArray(asistentes) ? asistentes : []), [asistentes]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [selectedUserJson, setSelectedUserJson] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [pagoAConfirmar, setPagoAConfirmar] = useState(null);

  // El catálogo completo de miembros e invitados sólo se descarga cuando se
  // abre el modal: antes se pedía en cada montaje aunque nadie fuera a
  // registrar a mano, y el endpoint no pagina.
  const { data: usersCatalog } = useSWR(
    isRegisterModalOpen ? '/api/admin/users' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const parchearInscripcion = (idInscripcion, cambios) => {
    mutarAsistentes(
      (actual = []) => actual.map((a) => (a.id_inscripcion === idInscripcion ? { ...a, ...cambios } : a)),
      { revalidate: false },
    );
  };

  const toggleAsistencia = async (inscripcionId, currentStatus) => {
    try {
      const res = await fetch(`/api/admin/inscripciones/${inscripcionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_asistencia', value: !currentStatus }),
      });
      if (!res.ok) throw new Error('Error al actualizar');
      parchearInscripcion(inscripcionId, { asistio: !currentStatus });
      toast.success(currentStatus ? 'Asistencia eliminada' : 'Asistencia registrada');
    } catch {
      toast.error('No se pudo actualizar la asistencia');
    }
  };

  const confirmarPago = async () => {
    if (!pagoAConfirmar) return;
    const { id_inscripcion, pago_completado } = pagoAConfirmar;
    try {
      const res = await fetch(`/api/admin/inscripciones/${id_inscripcion}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_pago', value: !pago_completado }),
      });
      if (!res.ok) throw new Error('Error al actualizar');
      parchearInscripcion(id_inscripcion, { pago_completado: !pago_completado });
      toast.success('Estado de pago actualizado');
    } catch {
      toast.error('No se pudo actualizar el pago');
    } finally {
      setPagoAConfirmar(null);
    }
  };

  const handleManualRegister = async (e) => {
    e.preventDefault();
    if (!selectedUserJson) {
      toast.warning('Selecciona un usuario');
      return;
    }

    setIsRegistering(true);
    try {
      const user = JSON.parse(selectedUserJson);
      const res = await fetch('/api/admin/eventos/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_evento: id, id_usuario: user.id, tipo_usuario: user.tipo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al registrar');

      toast.success(`${user.nombre_completo} quedó registrado`);
      setIsRegisterModalOpen(false);
      setSelectedUserJson('');
      mutarAsistentes();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsRegistering(false);
    }
  };

  const filteredAsistentes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      (a) =>
        a.nombre_completo?.toLowerCase().includes(q) ||
        a.correo?.toLowerCase().includes(q) ||
        a.numero_ieee?.includes(searchTerm.trim()),
    );
  }, [lista, searchTerm]);

  // Excluye del desplegable a quien ya está inscrito.
  //
  // Se compara por CORREO y no sólo por id porque el endpoint de asistentes no
  // devuelve `id_miembro` / `id_invitado` (ver notas): comparar `undefined ===
  // u.id` daba siempre false y el filtro no excluía a nadie, así que el admin
  // elegía a alguien ya inscrito y el API respondía con un error de duplicado.
  // El correo sí viaja en ambas listas. Se mantiene además la comparación por
  // id para que siga funcionando —y sea más precisa— en cuanto el API los
  // exponga. Las filas de tipo "Equipo" traen el correo del capitán, que
  // efectivamente ya está inscrito.
  const availableUsers = useMemo(() => {
    const catalogo = Array.isArray(usersCatalog) ? usersCatalog : [];
    const correosInscritos = new Set(
      lista.map((a) => a.correo?.trim().toLowerCase()).filter(Boolean),
    );
    return catalogo.filter((u) => {
      if (u.email && correosInscritos.has(u.email.trim().toLowerCase())) return false;
      return !lista.some(
        (a) =>
          (u.tipo === 'miembro' && a.id_miembro != null && a.id_miembro === u.id) ||
          (u.tipo === 'invitado' && a.id_invitado != null && a.id_invitado === u.id),
      );
    });
  }, [usersCatalog, lista]);

  const totalAsistieron = lista.filter((a) => a.asistio).length;

  const columnas = [
    { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium' },
    { header: 'Correo', accessor: 'correo', cellClassName: 'text-muted' },
    {
      header: 'Tipo',
      render: (row) => <Badge tone="neutral">{row.tipo_usuario}</Badge>,
    },
    {
      header: 'Pago',
      render: (row) =>
        row.requiere_pago ? (
          <button
            type="button"
            onClick={() => setPagoAConfirmar(row)}
            title="Cambiar el estado de pago"
          >
            <Badge tone={row.pago_completado ? 'success' : 'warning'}>
              {row.pago_completado ? 'Pagado' : 'Pendiente'}
            </Badge>
          </button>
        ) : (
          <span className="text-xs text-faint">Gratuito</span>
        ),
    },
    {
      header: 'Asistencia',
      align: 'center',
      render: (row) => (
        <button
          type="button"
          onClick={() => toggleAsistencia(row.id_inscripcion, row.asistio)}
          title={row.asistio ? 'Marcar como no asistió' : 'Marcar asistencia'}
          aria-label={row.asistio ? 'Marcar como no asistió' : 'Marcar asistencia'}
          aria-pressed={Boolean(row.asistio)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
            row.asistio
              ? 'border-brand/30 bg-brand-soft text-brand'
              : 'border-line bg-surface-2 text-faint hover:text-fg'
          }`}
        >
          {row.asistio ? <Check size={16} aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-current" />}
        </button>
      ),
    },
  ];

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a eventos
      </Button>

      <PageHeader
        title={evento?.nombre ?? 'Lista de asistencia'}
        description={
          evento
            ? `Lista de asistencia · ${formatearFechaDia(evento.fecha_inicio)}`
            : 'Lista de asistencia'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setIsQRScannerOpen(true)}>
              <QrCode size={16} aria-hidden="true" /> Escanear QR
            </Button>
            <Button onClick={() => setIsRegisterModalOpen(true)}>
              <UserPlus size={16} aria-hidden="true" /> Registrar manualmente
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard icon={Users} label="Inscritos" value={lista.length} tone="info" />
        <StatCard
          icon={UserRoundCheck}
          label="Asistieron"
          value={totalAsistieron}
          tone="brand"
          hint={lista.length ? `${Math.round((totalAsistieron / lista.length) * 100)}% de los inscritos` : undefined}
        />
      </div>

      <div className="mb-4">
        <Input
          type="search"
          placeholder="Buscar por nombre, correo o número IEEE…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          icon={<Search size={16} />}
          aria-label="Buscar asistentes"
          wrapperClassName="w-full md:max-w-md"
        />
      </div>

      <Table
        columns={columnas}
        data={filteredAsistentes}
        getRowKey={(row) => row.id_inscripcion}
        loading={isLoading && !asistentes}
        emptyMessage={
          <EmptyState
            icon={Users}
            title={searchTerm ? 'Sin coincidencias' : 'Nadie se ha inscrito todavía'}
            description={
              searchTerm
                ? 'Prueba con otro nombre, correo o número IEEE.'
                : 'Cuando alguien se inscriba aparecerá aquí; también puedes registrarlo a mano.'
            }
          />
        }
      />

      <Modal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        title="Registrar asistente manualmente"
        description="Inscribe a un miembro o invitado sin que pase por el formulario público."
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setIsRegisterModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="formulario-registro-manual" loading={isRegistering}>
              Registrar
            </Button>
          </>
        }
      >
        <form id="formulario-registro-manual" onSubmit={handleManualRegister}>
          <label htmlFor="usuario-a-registrar" className="mb-1.5 block text-sm font-medium text-muted">
            Usuario
          </label>
          <select
            id="usuario-a-registrar"
            value={selectedUserJson}
            onChange={(e) => setSelectedUserJson(e.target.value)}
            size={8}
            className="w-full rounded-lg border border-line bg-surface-2 p-2 text-sm text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          >
            {availableUsers.map((user) => (
              <option key={`${user.tipo}-${user.id}`} value={JSON.stringify(user)}>
                {user.nombre_completo} ({user.tipo}) — {user.email}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-faint">
            {usersCatalog
              ? availableUsers.length > 0
                ? 'Miembros e invitados que aún no están inscritos en este evento.'
                : 'No queda nadie por inscribir: todos los usuarios del sistema ya están en la lista.'
              : 'Cargando usuarios…'}
          </p>
        </form>
      </Modal>

      {/* Cambiar el pago es reversible, así que NO usa ConfirmDialog (que
          siempre advierte "no se puede deshacer"): basta un modal sobrio. Lo
          importante era sacarlo del confirm() nativo del navegador. */}
      <Modal
        isOpen={Boolean(pagoAConfirmar)}
        onClose={() => setPagoAConfirmar(null)}
        title={pagoAConfirmar?.pago_completado ? 'Marcar el pago como pendiente' : 'Confirmar el pago'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPagoAConfirmar(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarPago}>
              {pagoAConfirmar?.pago_completado ? 'Marcar pendiente' : 'Confirmar pago'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {pagoAConfirmar
            ? `${pagoAConfirmar.nombre_completo} pasará a “${
                pagoAConfirmar.pago_completado ? 'Pendiente' : 'Pagado'
              }”. Puedes volver a cambiarlo cuando quieras.`
            : ''}
        </p>
      </Modal>

      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        // Sin esto, escanear por error el ticket de OTRO evento marcaba la
        // asistencia allí y respondía "Asistencia registrada".
        eventoId={id}
        onSuccess={() => mutarAsistentes()}
      />
    </div>
  );
}
