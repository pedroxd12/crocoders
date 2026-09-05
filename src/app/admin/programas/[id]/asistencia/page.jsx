'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Download, UserPlus, UserMinus, Check, Minus, Users, Award, BadgeCheck, CalendarDays, Search,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { fetcher } from '@/lib/fetcher';
import { MesaEditable } from '@/components/asistentes/columnas';

export default function ProgramaAsistencia() {
  const { id } = useParams();
  const router = useRouter();

  const { data: programa } = useSWR(`/api/admin/programas/${id}`, fetcher, { revalidateOnFocus: false });
  const { data: asistenciaData, isLoading, mutate } = useSWR(
    `/api/admin/programas/${id}/asistencia`, fetcher, { revalidateOnFocus: false },
  );
  const asistencia = Array.isArray(asistenciaData) ? asistenciaData : [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUsuario, setSelectedUsuario] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [aDarDeBaja, setADarDeBaja] = useState(null);
  const [dandoBaja, setDandoBaja] = useState(false);
  const [acreditando, setAcreditando] = useState(null);

  // El catálogo de usuarios se pide solo al abrir el modal: pedirlo en el montaje
  // bloqueaba la carga de la página entera con la descarga de TODOS los miembros
  // e invitados aunque el admin nunca fuera a inscribir a nadie.
  const { data: usuariosData, isLoading: cargandoUsuarios } = useSWR(
    isModalOpen ? '/api/admin/users' : null, fetcher, { revalidateOnFocus: false },
  );
  const usuariosDisponibles = Array.isArray(usuariosData) ? usuariosData : [];

  const yaInscritos = useMemo(
    () => asistencia.map((a) => `${a.tipo}-${a.id_miembro || a.id_invitado}`),
    [asistencia],
  );

  const opcionesUsuarios = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return usuariosDisponibles
      .filter((u) => !yaInscritos.includes(`${u.tipo}-${u.id}`))
      .filter((u) => !termino ||
        `${u.nombre_completo || ''} ${u.email || ''}`.toLowerCase().includes(termino))
      .slice(0, 100) // el desplegable nativo no soporta miles de opciones: se acota y se busca
      .map((u) => ({
        value: JSON.stringify({ id: u.id, tipo: u.tipo }),
        label: `${u.nombre_completo} (${u.email}) — ${u.tipo}`,
      }));
  }, [usuariosDisponibles, yaInscritos, busqueda]);

  const handleInscribir = async (e) => {
    e.preventDefault();
    if (!selectedUsuario) {
      toast.warning('Selecciona un usuario');
      return;
    }
    setIsSubmitting(true);
    try {
      const user = JSON.parse(selectedUsuario);
      const res = await fetch(`/api/admin/programas/${id}/inscribir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_miembro: user.tipo === 'miembro' ? user.id : null,
          id_invitado: user.tipo === 'invitado' ? user.id : null,
        }),
      });
      const resultado = await res.json();
      if (!res.ok) throw new Error(resultado.error || 'Error al inscribir');

      toast.success(resultado.message || 'Usuario inscrito correctamente');
      setIsModalOpen(false);
      setSelectedUsuario('');
      setBusqueda('');
      mutate();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const darDeBaja = async () => {
    if (!aDarDeBaja) return;
    setDandoBaja(true);
    try {
      const res = await fetch(`/api/admin/programas/${id}/inscribir`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_miembro: aDarDeBaja.tipo === 'miembro' ? aDarDeBaja.id_miembro : null,
          id_invitado: aDarDeBaja.tipo === 'invitado' ? aDarDeBaja.id_invitado : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al dar de baja');
      }
      toast.success('Inscripción dada de baja');
      setADarDeBaja(null);
      mutate();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDandoBaja(false);
    }
  };

  // OJO: esto NO genera ningún documento. Marca al participante como acreditado
  // en su inscripción; la entrega del certificado sigue siendo manual.
  const acreditar = async (row) => {
    const clave = `${row.tipo}-${row.id_miembro || row.id_invitado}`;
    setAcreditando(clave);
    try {
      const res = await fetch(`/api/admin/programas/${id}/asistencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_miembro: row.tipo === 'miembro' ? row.id_miembro : null,
          id_invitado: row.tipo === 'invitado' ? row.id_invitado : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al acreditar');
      toast.success('Participante acreditado. Genera su certificado desde «Certificados y gafetes».');
      mutate();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setAcreditando(null);
    }
  };

  const exportarCSV = () => {
    // Escapar valores con comillas para no romper el CSV ante comas/comillas.
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const conMesas = Boolean(programa?.asignar_mesas);
    const headers = ['Nombre', 'Email', 'Teléfono', 'Tipo', ...(conMesas ? ['Mesa'] : []), 'Sesiones asistidas', '% Asistencia', 'Elegible', 'Acreditado'];
    const rows = asistencia.map((a) => [
      a.nombre_completo,
      a.email,
      a.telefono || '',
      a.tipo,
      ...(conMesas ? [a.mesa || ''] : []),
      a.sesiones_asistidas,
      `${a.porcentaje_asistencia}%`,
      a.elegible_certificado ? 'Sí' : 'No',
      a.certificado_emitido ? 'Sí' : 'No',
    ]);

    const csv = [headers, ...rows].map((row) => row.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const nombreSafe = (programa?.nombre || 'programa').replace(/\s+/g, '_');
    link.download = `asistencia_${nombreSafe}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Mesa o lugar del participante (migración 015): edición en línea contra
  // PATCH /api/admin/programas/[id]/mesa. Se parchea la fila local sin
  // volver a pedir el reporte entero.
  const guardarMesa = async (row, mesa) => {
    try {
      const res = await fetch(`/api/admin/programas/${id}/mesa`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_miembro: row.tipo === 'miembro' ? row.id_miembro : null,
          id_invitado: row.tipo === 'invitado' ? row.id_invitado : null,
          mesa,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo asignar la mesa');
      mutate(
        (actual = []) => actual.map((a) => (a.id_inscripcion_programa === row.id_inscripcion_programa ? { ...a, mesa: data.mesa ?? null } : a)),
        { revalidate: false },
      );
      toast.success(data.mesa ? `Mesa asignada: ${data.mesa}` : 'Mesa retirada');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const elegibles = asistencia.filter((a) => a.elegible_certificado && !a.certificado_emitido);
  const acreditados = asistencia.filter((a) => a.certificado_emitido);

  const columnas = [
    { key: 'nombre_completo', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (row) => <Badge tone={row.tipo === 'miembro' ? 'info' : 'neutral'}>{row.tipo}</Badge>,
    },
    ...(programa?.asignar_mesas
      ? [{
          key: 'mesa',
          label: 'Mesa',
          align: 'center',
          render: (row) => (
            <MesaEditable
              key={`${row.id_inscripcion_programa}-${row.mesa ?? ''}`}
              valor={row.mesa}
              onGuardar={(mesa) => guardarMesa(row, mesa)}
            />
          ),
        }]
      : []),
    { key: 'sesiones_asistidas', label: 'Sesiones', align: 'center', cellClassName: 'tabular-nums' },
    {
      key: 'porcentaje_asistencia',
      label: '% Asistencia',
      align: 'center',
      render: (row) => {
        const pct = parseFloat(row.porcentaje_asistencia) || 0;
        const minimo = parseFloat(programa?.porcentaje_asistencia_minimo ?? 80);
        // El color compara contra el umbral REAL del programa, no contra un 80 fijo.
        const color = pct >= minimo ? 'text-brand' : pct >= minimo / 2 ? 'text-warning' : 'text-danger';
        return <span className={`font-semibold tabular-nums ${color}`}>{pct.toFixed(1)}%</span>;
      },
    },
    {
      key: 'elegible_certificado',
      label: 'Elegible',
      align: 'center',
      render: (row) =>
        row.elegible_certificado ? (
          <Check size={18} className="mx-auto text-brand" aria-label="Cumple los requisitos" />
        ) : (
          <Minus size={18} className="mx-auto text-faint" aria-label="No cumple los requisitos" />
        ),
    },
    {
      key: 'certificado_emitido',
      label: 'Acreditación',
      align: 'center',
      render: (row) => {
        const clave = `${row.tipo}-${row.id_miembro || row.id_invitado}`;
        if (row.certificado_emitido) return <Badge tone="success">Acreditado</Badge>;
        if (!row.elegible_certificado) return <span className="text-xs text-faint">No elegible</span>;
        return (
          <Button
            variant="secondary"
            size="sm"
            loading={acreditando === clave}
            onClick={() => acreditar(row)}
          >
            Marcar acreditado
          </Button>
        );
      },
    },
    {
      key: 'acciones',
      label: 'Acciones',
      align: 'right',
      render: (row) => (
        <IconButton
          icon={UserMinus}
          label="Dar de baja del programa"
          tone="danger"
          onClick={() => setADarDeBaja(row)}
        />
      ),
    },
  ];

  return (
    <div className="w-full">
      <Button onClick={() => router.back()} variant="ghost" size="sm" className="mb-4">
        <ArrowLeft size={16} /> Volver a programas
      </Button>

      <PageHeader
        title="Reporte de asistencia"
        description={programa?.nombre || 'Cargando el programa…'}
        actions={
          <>
            <Button onClick={() => setIsModalOpen(true)} variant="primary">
              <UserPlus size={16} /> Inscribir usuario
            </Button>
            <Button onClick={exportarCSV} variant="secondary" disabled={asistencia.length === 0}>
              <Download size={16} /> Exportar CSV
            </Button>
            <Button onClick={() => router.push(`/admin/programas/${id}/documentos`)} variant="secondary">
              <Award size={16} /> Certificados y gafetes
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} tone="neutral" label="Inscritos activos" value={asistencia.length} hint="Sin contar las bajas" />
        <StatCard icon={Award} tone="brand" label="Elegibles" value={elegibles.length} hint="Cumplen y aún no están acreditados" />
        <StatCard icon={BadgeCheck} tone="info" label="Acreditados" value={acreditados.length} />
        <StatCard icon={CalendarDays} tone="accent" label="Sesiones del programa" value={programa?.total_sesiones ?? '—'} />
      </div>

      <Table
        columns={columnas}
        data={asistencia}
        loading={isLoading && asistencia.length === 0}
        getRowKey={(row) => row.id_inscripcion_programa}
        emptyMessage={
          <EmptyState
            icon={Users}
            title="Todavía no hay participantes"
            description="Nadie se ha inscrito a este programa, o todas las inscripciones están dadas de baja."
            action={
              <Button onClick={() => setIsModalOpen(true)} variant="primary">
                <UserPlus size={16} /> Inscribir usuario
              </Button>
            }
          />
        }
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Inscribir usuario al programa"
        description="Se inscribe al programa completo. Si el usuario se había dado de baja, su inscripción se reactiva."
        footer={
          <>
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="secondary">
              Cancelar
            </Button>
            <Button type="submit" form="form-inscribir" variant="primary" loading={isSubmitting}>
              Inscribir
            </Button>
          </>
        }
      >
        <form id="form-inscribir" onSubmit={handleInscribir} className="space-y-4">
          <Input
            label="Buscar"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre o correo"
            icon={<Search size={16} />}
            help="El desplegable muestra los 100 primeros resultados: acota la búsqueda si no encuentras a alguien."
          />

          <Select
            label="Usuario"
            value={selectedUsuario}
            onChange={(e) => setSelectedUsuario(e.target.value)}
            options={opcionesUsuarios}
            placeholder={cargandoUsuarios ? 'Cargando usuarios…' : 'Selecciona un usuario'}
            disabled={cargandoUsuarios}
            required
          />

          <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
            Su asistencia se actualiza sola conforme se registre en cada sesión.
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(aDarDeBaja)}
        onClose={() => setADarDeBaja(null)}
        onConfirm={darDeBaja}
        loading={dandoBaja}
        tone="danger"
        title={`¿Dar de baja a ${aDarDeBaja?.nombre_completo || ''}?`}
        message="La inscripción pasa a cancelada. El historial de asistencia se conserva."
        consequences={[
          'Desaparece de las listas de asistencia de las sesiones',
          'Deja de contar como inscrito y no puede acreditarse',
        ]}
        confirmLabel="Dar de baja"
      />
    </div>
  );
}
