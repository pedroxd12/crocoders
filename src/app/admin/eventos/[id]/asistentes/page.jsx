'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Check, Search, UserPlus, QrCode, Users, UserRoundCheck, Receipt,
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
import RegistroManualModal from '@/components/admin/RegistroManualModal';
import ComprobanteRevisionModal from '@/components/eventos/ComprobanteRevisionModal';
import { TONO_COMPROBANTE, ETIQUETA_COMPROBANTE } from '@/lib/comprobante-estado';
import { fetcher } from '@/lib/fetcher';
import { formatearFechaDia } from '@/lib/fechas';
import { NIVELES_ESTUDIO } from '@/lib/registro-campos';

const NIVEL_LABEL = Object.fromEntries(NIVELES_ESTUDIO.map((n) => [n.value, n.label]));

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
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [pagoAConfirmar, setPagoAConfirmar] = useState(null);
  // Fila cuyo comprobante se está revisando (null = modal cerrado).
  const [comprobanteAbierto, setComprobanteAbierto] = useState(null);

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

  const totalAsistieron = lista.filter((a) => a.asistio).length;
  // Trabajo pendiente de pago: comprobantes por revisar y quién no subió nada.
  const comprobantesPendientes = lista.filter((a) => a.comprobante_estado === 'pendiente').length;
  const sinComprobante = lista.filter((a) => a.requiere_pago && !a.id_comprobante).length;

  const columnas = [
    { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium' },
    { header: 'Correo', accessor: 'correo', cellClassName: 'text-muted' },
    {
      header: 'Tipo',
      render: (row) => <Badge tone="neutral">{row.tipo_usuario}</Badge>,
    },
    {
      header: 'Perfil',
      render: (row) =>
        row.tipo_usuario === 'Equipo' ? (
          <span className="text-xs text-muted">{row.integrantes_equipo} integrante(s)</span>
        ) : (
          <span className="text-xs text-muted">
            {NIVEL_LABEL[row.nivel_estudios] || '—'}
            {row.edad ? ` · ${row.edad} años` : ''}
          </span>
        ),
    },
    // La talla sólo tiene sentido cuando el evento la pide; en filas de equipo
    // llega ya agregada (una por integrante, "—" cuando falta). La entrega se
    // marca desde el escáner QR; aquí sólo se consulta el avance.
    ...(evento?.solicitar_talla
      ? [
          {
            header: 'Talla',
            render: (row) =>
              row.talla_playera ? (
                <span className="text-xs font-medium">{row.talla_playera}</span>
              ) : (
                <span className="text-xs text-faint">—</span>
              ),
          },
          {
            header: 'Playera',
            render: (row) =>
              row.tipo_usuario === 'Equipo' ? (
                <span className="text-xs text-muted">
                  {row.playeras_entregadas ?? 0}/{row.personas_equipo ?? 0} entregadas
                </span>
              ) : row.playera_entregada ? (
                <Badge tone="success">Entregada</Badge>
              ) : (
                <span className="text-xs text-faint">—</span>
              ),
          },
        ]
      : []),
    // Comprobante de pago (migración 013): sólo tiene sentido en eventos con
    // costo, y es la prueba con la que se decide el toggle de la columna Pago.
    ...(evento?.tiene_costo
      ? [
          {
            header: 'Comprobante',
            render: (row) =>
              row.id_comprobante ? (
                <button
                  type="button"
                  onClick={() => setComprobanteAbierto(row)}
                  title="Ver el comprobante y validar el pago"
                >
                  <Badge tone={TONO_COMPROBANTE[row.comprobante_estado] || 'neutral'}>
                    {ETIQUETA_COMPROBANTE[row.comprobante_estado] || row.comprobante_estado}
                  </Badge>
                </button>
              ) : (
                <span className="text-xs text-faint">Sin subir</span>
              ),
          },
        ]
      : []),
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
      // En un equipo la asistencia se lleva POR INTEGRANTE (migración 009) y se
      // marca desde el roster del escáner QR; el toggle de la inscripción
      // completa la desincronizaría, así que la fila de equipo muestra el
      // avance en lugar del botón.
      render: (row) =>
        row.tipo_usuario === 'Equipo' ? (
          <span
            className={`text-xs ${Number(row.integrantes_asistieron) > 0 ? 'font-medium text-brand' : 'text-faint'}`}
            title="Integrantes con llegada registrada (se marca escaneando el QR del equipo)"
          >
            {row.integrantes_asistieron ?? 0}/{row.integrantes_equipo ?? 0}
          </span>
        ) : (
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

      <div className={`mb-6 grid gap-4 ${evento?.tiene_costo ? 'grid-cols-2 sm:max-w-2xl sm:grid-cols-3' : 'grid-cols-2 sm:max-w-md'}`}>
        <StatCard icon={Users} label="Inscritos" value={lista.length} tone="info" />
        <StatCard
          icon={UserRoundCheck}
          label="Asistieron"
          value={totalAsistieron}
          tone="brand"
          hint={lista.length ? `${Math.round((totalAsistieron / lista.length) * 100)}% de los inscritos` : undefined}
        />
        {evento?.tiene_costo && (
          <StatCard
            icon={Receipt}
            label="Pagos por validar"
            value={comprobantesPendientes}
            tone="warning"
            hint={
              sinComprobante > 0
                ? `${sinComprobante} inscripción(es) aún sin comprobante`
                : 'Todos subieron su comprobante'
            }
          />
        )}
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

      {/* Registro manual con los MISMOS datos que el formulario público:
          buscador de usuarios existentes, ficha completa de invitado nuevo y,
          en concursos por equipos, el formulario de equipo. */}
      <RegistroManualModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        evento={evento}
        eventoId={id}
        asistentes={lista}
        onRegistered={() => mutarAsistentes()}
      />

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

      {/* Revisión del comprobante: la misma pantalla que usa el panel de staff. */}
      <ComprobanteRevisionModal
        key={comprobanteAbierto?.id_comprobante ?? 'ninguno'}
        fila={comprobanteAbierto}
        onClose={() => setComprobanteAbierto(null)}
        onRevisado={({ fila, comprobante, inscripcion }) => {
          // Se parchea la fila en local en vez de revalidar: el listado de un
          // evento grande es caro y el servidor ya devolvió el resultado.
          parchearInscripcion(fila.id_inscripcion, {
            comprobante_estado: comprobante.estado,
            comprobante_motivo_rechazo: comprobante.motivo_rechazo,
            comprobante_revisado_en: comprobante.revisado_en,
            pago_completado: inscripcion.pago_completado,
            estado: inscripcion.estado,
          });
        }}
      />

      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        // Sin esto, escanear por error el ticket de OTRO evento marcaba la
        // asistencia allí y respondía "Asistencia registrada".
        eventoId={id}
        onSuccess={() => mutarAsistentes()}
        // Los toggles de llegada/playera del panel del escáner también cambian
        // la lista (asistencia agregada del equipo, entrega de playeras).
        onUpdate={() => mutarAsistentes()}
      />
    </div>
  );
}
