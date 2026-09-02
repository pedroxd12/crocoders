'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import { ArrowLeft, Check, X, Users, QrCode } from 'lucide-react';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import QRScannerModal from '@/components/QRScannerModal';
import { fetcher } from '@/lib/fetcher';
import { formatearFecha, formatearHora } from '@/lib/programas-fechas';

export default function SesionAsistencia() {
  const { id, idSesion } = useParams();
  const router = useRouter();

  const { data, isLoading, mutate } = useSWR(
    `/api/admin/programas/${id}/sesiones/${idSesion}/asistencia`, fetcher, { revalidateOnFocus: false },
  );
  const lista = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // Los datos de la sesión salen del listado del programa: así la cabecera dice
  // "Sesión 3 · 15 sept" en vez de un id interno que no significa nada.
  const { data: sesionesData } = useSWR(
    `/api/admin/programas/${id}/sesiones`, fetcher, { revalidateOnFocus: false },
  );
  const sesion = useMemo(
    () => (Array.isArray(sesionesData) ? sesionesData : []).find((s) => String(s.id_sesion) === String(idSesion)),
    [sesionesData, idSesion],
  );

  // `solicitar_talla` es del PROGRAMA, no de la sesión: sin él no se pintan ni
  // la talla ni la entrega de playera.
  const { data: programa } = useSWR(
    `/api/admin/programas/${id}`, fetcher, { revalidateOnFocus: false },
  );
  const conPlayera = Boolean(programa?.solicitar_talla);

  const [guardando, setGuardando] = useState(null);
  const [escanerAbierto, setEscanerAbierto] = useState(false);

  const claveDe = (row) => `${row.tipo}-${row.id_miembro || row.id_invitado}`;

  const toggle = async (row) => {
    const clave = claveDe(row);
    setGuardando(clave);
    const nuevoValor = !row.asistio;
    try {
      const res = await fetch(`/api/admin/programas/${id}/sesiones/${idSesion}/asistencia`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_miembro: row.tipo === 'miembro' ? row.id_miembro : null,
          id_invitado: row.tipo === 'invitado' ? row.id_invitado : null,
          asistio: nuevoValor,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar');
      }
      // Actualización local sin volver a pedir la lista: marcar asistencia de 30
      // personas seguidas no debe recargar la tabla 30 veces.
      mutate(
        (actual = []) => actual.map((p) => (claveDe(p) === clave ? { ...p, asistio: nuevoValor } : p)),
        { revalidate: false },
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setGuardando(null);
    }
  };

  // La playera se entrega UNA vez en todo el programa (no por sesión), así que
  // esto va contra la inscripción al programa, no contra la asistencia.
  const togglePlayera = async (row) => {
    const clave = `${claveDe(row)}-playera`;
    setGuardando(clave);
    const nuevoValor = !row.playera_entregada;
    try {
      const res = await fetch(`/api/admin/programas/${id}/playera`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_miembro: row.tipo === 'miembro' ? row.id_miembro : null,
          id_invitado: row.tipo === 'invitado' ? row.id_invitado : null,
          entregada: nuevoValor,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar');
      }
      mutate(
        (actual = []) => actual.map((p) => (claveDe(p) === claveDe(row) ? { ...p, playera_entregada: nuevoValor } : p)),
        { revalidate: false },
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setGuardando(null);
    }
  };

  const presentes = lista.filter((p) => p.asistio).length;
  const playerasEntregadas = lista.filter((p) => p.playera_entregada).length;

  const columnas = [
    { key: 'nombre_completo', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (row) => <Badge tone={row.tipo === 'miembro' ? 'info' : 'neutral'}>{row.tipo}</Badge>,
    },
    ...(conPlayera
      ? [
          {
            key: 'talla_playera',
            label: 'Talla',
            render: (row) =>
              row.talla_playera ? (
                <span className="text-xs font-medium">{row.talla_playera}</span>
              ) : (
                <span className="text-xs text-faint">—</span>
              ),
          },
          {
            key: 'playera_entregada',
            label: 'Playera',
            align: 'center',
            render: (row) => (
              <Button
                variant={row.playera_entregada ? 'primary' : 'secondary'}
                size="sm"
                loading={guardando === `${claveDe(row)}-playera`}
                onClick={() => togglePlayera(row)}
                aria-pressed={Boolean(row.playera_entregada)}
                title="La playera se entrega una sola vez en todo el programa"
              >
                {row.playera_entregada ? <Check size={14} /> : <X size={14} />}
                {row.playera_entregada ? 'Entregada' : 'Pendiente'}
              </Button>
            ),
          },
        ]
      : []),
    {
      key: 'asistio',
      label: 'Asistencia',
      align: 'center',
      render: (row) => {
        const clave = claveDe(row);
        return (
          <Button
            variant={row.asistio ? 'primary' : 'secondary'}
            size="sm"
            loading={guardando === clave}
            onClick={() => toggle(row)}
            aria-pressed={row.asistio}
          >
            {row.asistio ? <Check size={14} /> : <X size={14} />}
            {row.asistio ? 'Asistió' : 'No asistió'}
          </Button>
        );
      },
    },
  ];

  const descripcion = [
    sesion
      ? formatearFecha(sesion.fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : null,
    sesion ? [formatearHora(sesion.hora_inicio), formatearHora(sesion.hora_fin)].filter(Boolean).join(' – ') : null,
    `${presentes} de ${lista.length} presentes`,
    conPlayera ? `${playerasEntregadas} playera(s) entregada(s)` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="w-full">
      <Button onClick={() => router.back()} variant="ghost" size="sm" className="mb-4">
        <ArrowLeft size={16} /> Volver a sesiones
      </Button>

      <PageHeader
        title={sesion?.titulo || `Sesión ${sesion?.numero_sesion ?? ''}`.trim() || 'Registro de asistencia'}
        description={descripcion}
        actions={
          <Button variant="secondary" onClick={() => setEscanerAbierto(true)}>
            <QrCode size={16} aria-hidden="true" /> Escanear QR
          </Button>
        }
      />

      <Table
        columns={columnas}
        data={lista}
        loading={isLoading && lista.length === 0}
        getRowKey={(row) => claveDe(row)}
        emptyMessage={
          <EmptyState
            icon={Users}
            title="No hay a quién pasar lista"
            description="Solo aparecen los inscritos activos del programa. Inscribe participantes desde el reporte de asistencia del programa."
          />
        }
      />

      <QRScannerModal
        isOpen={escanerAbierto}
        onClose={() => setEscanerAbierto(false)}
        // El ticket del participante vale para todo el programa; la sesión dice
        // en cuál lista se marca la llegada.
        programa={{ id, sesionId: idSesion }}
        onSuccess={() => mutate()}
        onUpdate={() => mutate()}
      />
    </div>
  );
}
