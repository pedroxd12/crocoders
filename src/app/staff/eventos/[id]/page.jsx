'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  CreditCard,
  MapPin,
  QrCode,
  Search,
  Users,
  X,
} from 'lucide-react';

import { fetcher } from '@/lib/fetcher';
import { sanitizeHtml } from '@/lib/sanitize';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Table from '@/components/ui/Table';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import QRScannerModal from '@/components/QRScannerModal';
import { formatearFechaHora, formatearFechaLarga, formatearHora } from '@/lib/fechas';
import { estadoTemporal } from '../../fechas';

/** Dato de cabecera del evento: etiqueta pequeña + valor legible. */
function Meta({ icon: Icon, etiqueta, valor }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-faint">
        <Icon size={13} aria-hidden="true" />
        {etiqueta}
      </p>
      <p className="mt-1 text-sm text-fg">{valor}</p>
    </div>
  );
}

const TONO_TIPO = {
  miembro: 'info',
  invitado: 'neutral',
  equipo: 'warning',
};

export default function StaffEventoDetalle() {
  const { id } = useParams();
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [escanerAbierto, setEscanerAbierto] = useState(false);

  const {
    data: detalle,
    error: errorDetalle,
    isLoading: cargandoDetalle,
  } = useSWR(id ? `/api/staff/eventos/${id}` : null, fetcher, { revalidateOnFocus: false });

  const {
    data: asistentesData,
    isLoading: cargandoAsistentes,
    mutate: refrescarAsistentes,
  } = useSWR(id ? `/api/staff/eventos/${id}/asistentes` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const evento = detalle?.evento || null;
  const miRol = detalle?.mi_rol || null;
  const asistentes = useMemo(
    () => (Array.isArray(asistentesData) ? asistentesData : []),
    [asistentesData],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return asistentes;
    return asistentes.filter(
      (a) =>
        a.nombre_completo?.toLowerCase().includes(q) ||
        a.correo?.toLowerCase().includes(q) ||
        a.numero_ieee?.includes(q),
    );
  }, [asistentes, busqueda]);

  const totalAsistieron = asistentes.filter((a) => a.asistio).length;
  const porcentaje = asistentes.length > 0
    ? Math.round((totalAsistieron / asistentes.length) * 100)
    : 0;

  // 403: el usuario no es staff de este evento.
  if (errorDetalle?.status === 403) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-16">
        <EmptyState
          icon={X}
          title="No tienes permisos para este evento"
          description="Solo el staff asignado puede ver la lista de asistentes."
          action={<Button size="sm" onClick={() => router.push('/staff')}>Volver al panel</Button>}
        />
      </div>
    );
  }

  const estado = evento ? estadoTemporal(evento) : null;
  const horario = evento?.hora_inicio
    ? `${formatearHora(evento.hora_inicio)} – ${formatearHora(evento.hora_fin)}`
    : '';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-16">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.push('/staff')}>
        <ArrowLeft size={15} aria-hidden="true" />
        Panel de staff
      </Button>

      {cargandoDetalle && !evento ? (
        <Card className="mb-6">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-6 h-24 w-full" />
        </Card>
      ) : evento ? (
        <>
          <PageHeader
            title={evento.nombre}
            description={evento.tipo_evento || undefined}
            actions={
              <div className="flex items-center gap-2">
                {estado && <Badge tone={estado.tone}>{estado.label}</Badge>}
                {miRol && <Badge tone="info">Mi rol: {miRol.rol}</Badge>}
              </div>
            }
          />

          {evento.imagen_url && (
            <div
              className="mb-6 h-44 rounded-xl border border-line bg-cover bg-center"
              style={{ backgroundImage: `url(${evento.imagen_url})` }}
              role="presentation"
            />
          )}

          {evento.descripcion && (
            <Card className="mb-6">
              {/* La columna es descripcion_html: antes se imprimía como texto
                  plano leyendo un campo `descripcion` que la API de detalle no
                  devolvía, así que el párrafo salía siempre vacío. */}
              <div
                className="prose-sm max-w-none text-sm leading-relaxed text-muted [&_a]:text-brand [&_strong]:text-fg"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(evento.descripcion) }}
              />
            </Card>
          )}

          <Card className="mb-4">
            <div className="grid gap-5 sm:grid-cols-3">
              <Meta icon={CalendarDays} etiqueta="Fecha" valor={formatearFechaLarga(evento.fecha_inicio)} />
              {/* Antes se imprimía la hora cruda de Postgres: "18:00:00 - 21:00:00". */}
              <Meta icon={Clock} etiqueta="Horario" valor={horario || 'Por definir'} />
              <Meta icon={MapPin} etiqueta="Ubicación" valor={evento.ubicacion || 'Por definir'} />
            </div>
          </Card>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={Check}
              label="Asistencia"
              value={`${porcentaje}%`}
              hint={`${totalAsistieron} de ${asistentes.length} inscritos`}
              tone="brand"
            />
            <StatCard
              icon={Users}
              label="Inscritos"
              value={evento.total_inscritos ?? asistentes.length}
              tone="info"
            />
            <StatCard
              icon={CreditCard}
              label="Pagos completados"
              value={evento.pagos_completados || 0}
              tone="neutral"
            />
          </div>
        </>
      ) : (
        <Card className="mb-6 border-danger/30 bg-danger-soft">
          <p className="text-sm text-danger">No pudimos cargar este evento.</p>
        </Card>
      )}

      <Card className="mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <Button className="md:w-auto" onClick={() => setEscanerAbierto(true)}>
            <QrCode size={16} aria-hidden="true" />
            Escanear QR de asistencia
          </Button>
          <Input
            label="Buscar asistente"
            wrapperClassName="flex-1"
            placeholder="Nombre, correo o número IEEE"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            icon={<Search size={15} aria-hidden="true" />}
          />
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-fg">Asistentes</h2>
        {asistentes.length > 0 && (
          <p className="text-xs text-muted tabular-nums">
            {filtrados.length} de {asistentes.length}
          </p>
        )}
      </div>

      <Table
        loading={cargandoAsistentes && asistentes.length === 0}
        getRowKey={(row) => row.id_inscripcion}
        columns={[
          { key: 'nombre_completo', label: 'Nombre' },
          { key: 'correo', label: 'Correo' },
          {
            key: 'tipo',
            label: 'Tipo',
            render: (row) => <Badge tone={TONO_TIPO[row.tipo] || 'neutral'}>{row.tipo}</Badge>,
          },
          {
            key: 'asistio',
            label: 'Asistencia',
            align: 'center',
            render: (row) =>
              row.asistio ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-brand">
                  <Check size={14} aria-hidden="true" />
                  Asistió
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-faint">
                  <X size={14} aria-hidden="true" />
                  Sin registrar
                </span>
              ),
          },
          {
            key: 'fecha_inscripcion',
            label: 'Se inscribió',
            // fecha_inscripcion SÍ es un timestamp real, no un día suelto.
            render: (row) => formatearFechaHora(row.fecha_inscripcion),
          },
        ]}
        data={filtrados}
        emptyMessage={
          <EmptyState
            icon={Search}
            title={busqueda ? 'Ningún asistente coincide' : 'Todavía no hay inscritos'}
            description={
              busqueda
                ? 'Prueba con otro nombre, correo o número IEEE.'
                : 'Cuando alguien se inscriba al evento aparecerá en esta lista.'
            }
          />
        }
      />

      <QRScannerModal
        isOpen={escanerAbierto}
        onClose={() => setEscanerAbierto(false)}
        // Se pasa el evento que se está viendo para que el escáner pueda
        // rechazar un ticket de OTRO evento. Hoy el modal y /api/eventos/verify-qr
        // sacan el evento del propio token, así que escanear por error el
        // ticket de otro evento responde "Asistencia registrada" y la marca allí.
        eventoId={id}
        onSuccess={(data) => {
          toast.success(`Asistencia registrada: ${data?.nombre || 'asistente'}`);
          refrescarAsistentes();
        }}
      />
    </div>
  );
}
