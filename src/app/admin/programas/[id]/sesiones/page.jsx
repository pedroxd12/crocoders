'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import { ArrowLeft, Plus, Trash2, CalendarDays, Users, Award, Percent, ClipboardCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Checkbox from '@/components/programas/Checkbox';
import { fetcher } from '@/lib/fetcher';
import { aFechaISO, formatearFecha, formatearHora, formatearRango } from '@/lib/programas-fechas';

const FORM_VACIO = {
  numero_sesion: 1,
  titulo: '',
  descripcion: '',
  fecha: '',
  hora_inicio: '',
  hora_fin: '',
  ubicacion: '',
  es_obligatoria: true,
};

export default function ProgramaSesiones() {
  const { id } = useParams();
  const router = useRouter();

  const { data: programa, mutate: mutatePrograma } = useSWR(
    `/api/admin/programas/${id}`, fetcher, { revalidateOnFocus: false },
  );
  const { data: sesionesData, isLoading, mutate: mutateSesiones } = useSWR(
    `/api/admin/programas/${id}/sesiones`, fetcher, { revalidateOnFocus: false },
  );
  const sesiones = Array.isArray(sesionesData) ? sesionesData : [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aBorrar, setABorrar] = useState(null);
  const [borrando, setBorrando] = useState(false);
  const [formData, setFormData] = useState(FORM_VACIO);

  const handleOpenModal = () => {
    const siguiente = sesiones.length > 0
      ? Math.max(...sesiones.map((s) => s.numero_sesion)) + 1
      : 1;
    setFormData({
      ...FORM_VACIO,
      numero_sesion: siguiente,
      ubicacion: programa?.ubicacion || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/programas/${id}/sesiones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const resultado = await res.json();
      if (!res.ok) throw new Error(resultado.error || 'Error al agregar la sesión');

      toast.success('Sesión agregada correctamente');
      setIsModalOpen(false);
      mutateSesiones();
      mutatePrograma();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      const res = await fetch(`/api/admin/programas/${id}/sesiones/${aBorrar.id_sesion}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al eliminar la sesión');
      }
      toast.success('Sesión eliminada');
      setABorrar(null);
      mutateSesiones();
      mutatePrograma();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBorrando(false);
    }
  };

  const columnas = [
    { key: 'numero_sesion', label: '#', cellClassName: 'font-semibold text-brand tabular-nums' },
    {
      key: 'titulo',
      label: 'Título',
      render: (row) => row.titulo || `Sesión ${row.numero_sesion}`,
    },
    {
      key: 'fecha',
      label: 'Fecha y hora',
      render: (row) => {
        const horas = [formatearHora(row.hora_inicio), formatearHora(row.hora_fin)].filter(Boolean);
        return (
          <div>
            <div>{formatearFecha(row.fecha, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            {horas.length > 0 && <div className="text-xs text-faint">{horas.join(' – ')}</div>}
          </div>
        );
      },
    },
    { key: 'ubicacion', label: 'Ubicación', render: (row) => row.ubicacion || '—' },
    {
      key: 'asistencia',
      label: 'Asistencia',
      align: 'center',
      render: (row) => (
        <span className="tabular-nums">
          {row.asistentes_presentes}/{row.total_inscritos}
          {row.total_inscritos > 0 && (
            <span className="ml-1 text-xs text-faint">
              ({Math.round((row.asistentes_presentes / row.total_inscritos) * 100)}%)
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'es_obligatoria',
      label: 'Obligatoria',
      align: 'center',
      render: (row) => (
        <Badge tone={row.es_obligatoria ? 'info' : 'neutral'}>
          {row.es_obligatoria ? 'Sí' : 'No'}
        </Badge>
      ),
    },
    {
      key: 'acciones',
      label: 'Acciones',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <IconButton
            icon={ClipboardCheck}
            label="Registrar asistencia de esta sesión"
            tone="info"
            onClick={() => router.push(`/admin/programas/${id}/sesiones/${row.id_sesion}/asistencia`)}
          />
          <IconButton
            icon={Trash2}
            label="Eliminar sesión"
            tone="danger"
            onClick={() => setABorrar(row)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="w-full">
      <Button onClick={() => router.back()} variant="ghost" size="sm" className="mb-4">
        <ArrowLeft size={16} /> Volver a programas
      </Button>

      <PageHeader
        title={programa?.nombre || 'Sesiones del programa'}
        description={
          programa
            ? `${formatearRango(programa.fecha_inicio, programa.fecha_fin)}${programa.ubicacion ? ` · ${programa.ubicacion}` : ''}`
            : 'Cargando el programa…'
        }
        actions={
          <Button onClick={handleOpenModal} variant="primary">
            <Plus size={16} /> Agregar sesión
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CalendarDays} tone="neutral" label="Sesiones" value={programa?.total_sesiones ?? '—'} />
        <StatCard icon={Users} tone="brand" label="Inscritos activos" value={programa?.total_inscritos ?? '—'} />
        <StatCard
          icon={Award}
          tone="info"
          label="Sesiones requeridas"
          value={programa?.sesiones_requeridas_certificado ?? '—'}
          hint="Mínimo para acreditar"
        />
        {/* porcentaje_asistencia_minimo es numeric(5,2) y llega como "80.00":
            sin parseFloat la tarjeta mostraba "80.00%". */}
        <StatCard
          icon={Percent}
          tone="accent"
          label="% mínimo"
          value={programa ? `${parseFloat(programa.porcentaje_asistencia_minimo) || 0}%` : '—'}
          hint="Sobre sesiones obligatorias"
        />
      </div>

      <Table
        columns={columnas}
        data={sesiones}
        loading={isLoading && sesiones.length === 0}
        getRowKey={(row) => row.id_sesion}
        emptyMessage={
          <EmptyState
            icon={CalendarDays}
            title="Este programa no tiene sesiones"
            description="Sin sesiones no se puede registrar asistencia ni acreditar a nadie. Añádelas a mano o edita el programa marcando días y horas para generarlas."
            action={
              <Button onClick={handleOpenModal} variant="primary">
                <Plus size={16} /> Agregar sesión
              </Button>
            }
          />
        }
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Agregar sesión al programa"
        description={
          programa
            ? `La fecha debe caer dentro del periodo del programa (${formatearRango(programa.fecha_inicio, programa.fecha_fin)}).`
            : undefined
        }
        footer={
          <>
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="secondary">
              Cancelar
            </Button>
            <Button type="submit" form="form-sesion" variant="primary" loading={isSubmitting}>
              Agregar sesión
            </Button>
          </>
        }
      >
        <form id="form-sesion" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Número de sesión"
            type="number"
            min="1"
            value={formData.numero_sesion}
            onChange={(e) => setFormData({ ...formData, numero_sesion: e.target.value })}
            required
          />

          <Input
            label="Título de la sesión"
            value={formData.titulo}
            onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
            placeholder={`Sesión ${formData.numero_sesion}`}
            help="Opcional: si lo dejas vacío se muestra el número de sesión."
          />

          <Input
            label="Fecha"
            type="date"
            value={formData.fecha}
            onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
            min={aFechaISO(programa?.fecha_inicio) || undefined}
            max={aFechaISO(programa?.fecha_fin) || undefined}
            required
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Hora de inicio"
              type="time"
              value={formData.hora_inicio}
              onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
            />
            <Input
              label="Hora de fin"
              type="time"
              value={formData.hora_fin}
              onChange={(e) => setFormData({ ...formData, hora_fin: e.target.value })}
            />
          </div>

          <Input
            label="Ubicación"
            value={formData.ubicacion}
            onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
          />

          <Textarea
            label="Descripción"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            rows={3}
          />

          <Checkbox
            label="Sesión obligatoria"
            help="Solo las sesiones obligatorias cuentan para el porcentaje de asistencia y la acreditación."
            checked={formData.es_obligatoria}
            onChange={(e) => setFormData({ ...formData, es_obligatoria: e.target.checked })}
          />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(aBorrar)}
        onClose={() => setABorrar(null)}
        onConfirm={handleDelete}
        loading={borrando}
        title={`¿Eliminar la sesión #${aBorrar?.numero_sesion ?? ''}?`}
        message="Se borra la sesión del calendario del programa."
        consequences={[
          `La asistencia registrada de ${aBorrar?.asistentes_presentes ?? 0} participante(s) en esta sesión`,
          'Los porcentajes de asistencia de todo el programa se recalculan al quitar esta sesión del total',
        ]}
        confirmLabel="Eliminar sesión"
      />
    </div>
  );
}
