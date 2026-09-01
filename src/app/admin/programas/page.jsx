'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import Image from 'next/image';
import { Plus, Pencil, Trash2, Calendar, Users, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Checkbox from '@/components/programas/Checkbox';
import { UploadButton } from '@/utils/uploadthing';
import { fetcher } from '@/lib/fetcher';
import {
  DIAS_SEMANA_OPCIONES,
  aFechaISO,
  aHoraCorta,
  formatearRango,
} from '@/lib/programas-fechas';

const FORM_VACIO = {
  nombre: '',
  descripcion: '',
  fecha_inicio: '',
  fecha_fin: '',
  id_tipo_evento: '',
  id_alcance: '',
  sesiones_requeridas_certificado: 0,
  porcentaje_asistencia_minimo: 80,
  ubicacion: '',
  imagen_url: '',
  dias_semana: [],
  hora_inicio: '',
  hora_fin: '',
  activo: true,
};

/**
 * Estado real del programa, sin fingir. `activo` es un interruptor manual (nada
 * lo apaga al pasar la fecha de fin), así que se muestran las dos cosas: si está
 * publicado y en qué punto del calendario está.
 */
function estadoPrograma(row) {
  // Hoy en la zona del navegador (no toISOString, que es UTC y adelanta el día
  // en México a partir de las 18:00).
  const hoy = aFechaISO(new Date());
  const inicio = aFechaISO(row.fecha_inicio);
  const fin = aFechaISO(row.fecha_fin) || inicio;
  if (fin && fin < hoy) return { texto: 'Finalizado', tono: 'neutral' };
  if (inicio && inicio > hoy) return { texto: 'Próximo', tono: 'info' };
  return { texto: 'En curso', tono: 'success' };
}

export default function ProgramasRecurrentes() {
  const router = useRouter();

  // SWR conserva los datos ya cargados mientras revalida: antes cada visita
  // vaciaba la pantalla con un spinner a página completa.
  const { data, isLoading, mutate } = useSWR('/api/admin/programas', fetcher, {
    revalidateOnFocus: false,
  });
  const { data: catalogos } = useSWR('/api/admin/catalogos', fetcher, {
    revalidateOnFocus: false,
  });

  const programas = Array.isArray(data) ? data : [];
  const tiposEvento = catalogos?.tipos || [];
  const alcances = catalogos?.alcances || [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPrograma, setEditingPrograma] = useState(null);
  const [regenerarSesiones, setRegenerarSesiones] = useState(false);
  const [aBorrar, setABorrar] = useState(null);
  const [borrando, setBorrando] = useState(false);
  const [formData, setFormData] = useState(FORM_VACIO);

  const handleOpenModal = (programa = null) => {
    setRegenerarSesiones(false);
    if (programa) {
      setEditingPrograma(programa);
      setFormData({
        nombre: programa.nombre,
        descripcion: programa.descripcion || '',
        fecha_inicio: aFechaISO(programa.fecha_inicio) || '',
        fecha_fin: aFechaISO(programa.fecha_fin) || '',
        id_tipo_evento: programa.id_tipo_evento,
        id_alcance: programa.id_alcance,
        sesiones_requeridas_certificado: programa.sesiones_requeridas_certificado ?? 0,
        porcentaje_asistencia_minimo: programa.porcentaje_asistencia_minimo ?? 80,
        ubicacion: programa.ubicacion || '',
        imagen_url: programa.imagen_url || '',
        // Se precargan los valores REALES: antes se abrían en blanco y guardar
        // cualquier cambio parecía borrar el horario del programa.
        dias_semana: Array.isArray(programa.dias_semana) ? programa.dias_semana : [],
        hora_inicio: aHoraCorta(programa.hora_inicio),
        hora_fin: aHoraCorta(programa.hora_fin),
        activo: programa.activo !== false,
      });
    } else {
      setEditingPrograma(null);
      setFormData(FORM_VACIO);
    }
    setIsModalOpen(true);
  };

  const handleDayChange = (dayValue) => {
    setFormData((prev) => {
      const dias = prev.dias_semana || [];
      return dias.includes(dayValue)
        ? { ...prev, dias_semana: dias.filter((d) => d !== dayValue) }
        : { ...prev, dias_semana: [...dias, dayValue] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const url = editingPrograma
        ? `/api/admin/programas/${editingPrograma.id_programa}`
        : '/api/admin/programas';

      const body = {
        ...formData,
        // Los numéricos se guardan crudos en el estado para poder escribir 0 o
        // vaciar el campo; se normalizan aquí, al construir la petición.
        sesiones_requeridas_certificado:
          formData.sesiones_requeridas_certificado === '' ? 0 : Number(formData.sesiones_requeridas_certificado),
        porcentaje_asistencia_minimo:
          formData.porcentaje_asistencia_minimo === '' ? 80 : Number(formData.porcentaje_asistencia_minimo),
      };
      if (editingPrograma) body.regenerar_sesiones = regenerarSesiones;

      const res = await fetch(url, {
        method: editingPrograma ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const resultado = await res.json();
      if (!res.ok) throw new Error(resultado.error || 'Error al guardar programa');

      if (editingPrograma) {
        if (resultado.sesiones_regeneradas > 0) {
          toast.success(
            `Programa actualizado. Se generaron ${resultado.sesiones_regeneradas} sesiones` +
            (resultado.sesiones_conservadas > 0
              ? ` y se conservaron ${resultado.sesiones_conservadas} con asistencia ya registrada.`
              : '.'),
          );
        } else {
          toast.success('Programa actualizado');
        }
        // Aviso explícito: cambiar las fechas no mueve las sesiones ya creadas.
        if (resultado.sesiones_fuera_de_rango > 0 && !resultado.sesiones_regeneradas) {
          toast.warning(
            `${resultado.sesiones_fuera_de_rango} sesión(es) quedan fuera del nuevo periodo. ` +
            'Vuelve a editar el programa y marca "Regenerar sesiones" para rehacer el calendario.',
            { autoClose: 8000 },
          );
        }
      } else {
        toast.success(
          resultado.sesiones_generadas > 0
            ? `Programa creado con ${resultado.sesiones_generadas} sesiones`
            : 'Programa creado (sin sesiones: añádelas desde "Sesiones")',
        );
      }

      setIsModalOpen(false);
      mutate();
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
      const res = await fetch(`/api/admin/programas/${aBorrar.id_programa}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al eliminar el programa');
      }
      toast.success('Programa eliminado');
      setABorrar(null);
      mutate();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBorrando(false);
    }
  };

  const columnas = [
    { key: 'nombre', label: 'Nombre' },
    {
      key: 'fecha_inicio',
      label: 'Periodo',
      render: (row) => formatearRango(row.fecha_inicio, row.fecha_fin),
    },
    { key: 'tipo_evento', label: 'Tipo' },
    { key: 'total_sesiones', label: 'Sesiones', align: 'center' },
    { key: 'total_inscritos', label: 'Inscritos', align: 'center' },
    {
      key: 'activo',
      label: 'Estado',
      align: 'center',
      render: (row) => {
        const { texto, tono } = estadoPrograma(row);
        return (
          <div className="inline-flex flex-wrap items-center justify-center gap-1">
            <Badge tone={tono}>{texto}</Badge>
            {!row.activo && <Badge tone="neutral">Oculto</Badge>}
          </div>
        );
      },
    },
    {
      key: 'acciones',
      label: 'Acciones',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <IconButton
            icon={Calendar}
            label="Ver sesiones"
            tone="info"
            onClick={() => router.push(`/admin/programas/${row.id_programa}/sesiones`)}
          />
          <IconButton
            icon={Users}
            label="Reporte de asistencia"
            tone="brand"
            onClick={() => router.push(`/admin/programas/${row.id_programa}/asistencia`)}
          />
          <IconButton icon={Pencil} label="Editar programa" onClick={() => handleOpenModal(row)} />
          <IconButton
            icon={Trash2}
            label="Eliminar programa"
            tone="danger"
            onClick={() => setABorrar(row)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="w-full">
      <PageHeader
        title="Programas recurrentes"
        description="Cursos y talleres con varias sesiones. El estado indica en qué punto del calendario está cada uno; “Oculto” significa que no aparece en el catálogo público."
        actions={
          <Button onClick={() => handleOpenModal()} variant="primary">
            <Plus size={16} /> Nuevo programa
          </Button>
        }
      />

      <Table
        columns={columnas}
        data={programas}
        loading={isLoading && programas.length === 0}
        getRowKey={(row) => row.id_programa}
        emptyMessage={
          <EmptyState
            icon={Calendar}
            title="Todavía no hay programas"
            description="Un programa agrupa varias sesiones con asistencia y certificado. Crea el primero para empezar."
            action={
              <Button onClick={() => handleOpenModal()} variant="primary">
                <Plus size={16} /> Nuevo programa
              </Button>
            }
          />
        }
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPrograma ? 'Editar programa' : 'Nuevo programa'}
        description={
          editingPrograma
            ? 'Los cambios de horario no rehacen el calendario salvo que lo pidas explícitamente.'
            : 'Si marcas días de la semana y horas, las sesiones se generan solas.'
        }
        footer={
          <>
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="secondary">
              Cancelar
            </Button>
            <Button type="submit" form="form-programa" variant="primary" loading={isSubmitting}>
              {editingPrograma ? 'Guardar cambios' : 'Crear programa'}
            </Button>
          </>
        }
      >
        <form id="form-programa" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre del programa"
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            required
          />

          <Textarea
            label="Descripción"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            rows={3}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Fecha de inicio"
              type="date"
              value={formData.fecha_inicio}
              onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
              required
            />
            <Input
              label="Fecha de fin"
              type="date"
              value={formData.fecha_fin}
              onChange={(e) => setFormData({ ...formData, fecha_fin: e.target.value })}
              required
            />
          </div>

          <div className="rounded-xl border border-line bg-surface-2 p-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-fg">Horario de las sesiones</p>
              <p className="mt-0.5 text-xs text-faint">
                Con días y horas, el sistema crea una sesión por cada día marcado dentro del periodo.
              </p>
            </div>

            <div>
              <span id="label-dias-semana" className="mb-1.5 block text-sm font-medium text-muted">Días de la semana</span>
              {/* role="group" + aria-labelledby: son botones sueltos, sin esto el
                  lector de pantalla los anuncia sin decir de qué son los días. */}
              <div role="group" aria-labelledby="label-dias-semana" className="flex flex-wrap gap-2">
                {DIAS_SEMANA_OPCIONES.map((dia) => {
                  const activo = formData.dias_semana.includes(dia.value);
                  return (
                    <button
                      key={dia.value}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => handleDayChange(dia.value)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        activo
                          ? 'border-brand/40 bg-brand-soft text-brand'
                          : 'border-line bg-surface text-muted hover:bg-surface-3 hover:text-fg'
                      }`}
                    >
                      {dia.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Hora de inicio"
                type="time"
                value={formData.hora_inicio}
                onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                // Sin horas no se genera ni una sesión: se exige en cuanto hay días.
                required={formData.dias_semana.length > 0}
              />
              <Input
                label="Hora de fin"
                type="time"
                value={formData.hora_fin}
                onChange={(e) => setFormData({ ...formData, hora_fin: e.target.value })}
                required={formData.dias_semana.length > 0}
              />
            </div>

            {editingPrograma && (
              <Checkbox
                label="Regenerar sesiones con este horario"
                help="Borra las sesiones que aún no tienen asistencia registrada y vuelve a crearlas dentro del nuevo periodo. Las sesiones con asistencia se conservan intactas."
                checked={regenerarSesiones}
                onChange={(e) => setRegenerarSesiones(e.target.checked)}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Tipo de evento"
              value={formData.id_tipo_evento}
              onChange={(e) => setFormData({ ...formData, id_tipo_evento: e.target.value })}
              options={tiposEvento.map((t) => ({ value: t.id_tipo_evento, label: t.nombre }))}
              required
            />
            <Select
              label="Alcance"
              value={formData.id_alcance}
              onChange={(e) => setFormData({ ...formData, id_alcance: e.target.value })}
              options={alcances.map((a) => ({ value: a.id_alcance, label: a.nombre }))}
              required
            />
          </div>

          <Input
            label="Ubicación"
            value={formData.ubicacion}
            onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Sesiones requeridas"
              type="number"
              min="0"
              value={formData.sesiones_requeridas_certificado}
              onChange={(e) => setFormData({ ...formData, sesiones_requeridas_certificado: e.target.value })}
              help="Mínimo de sesiones obligatorias a las que hay que asistir para quedar acreditado. 0 = sin mínimo."
            />
            <Input
              label="% de asistencia mínimo"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.porcentaje_asistencia_minimo}
              onChange={(e) => setFormData({ ...formData, porcentaje_asistencia_minimo: e.target.value })}
              help="Porcentaje sobre las sesiones obligatorias. Se aplica junto al mínimo anterior para decidir quién es elegible."
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-muted">Imagen del programa</span>
            {formData.imagen_url ? (
              <div className="relative h-48 w-full overflow-hidden rounded-xl border border-line bg-surface-2">
                <Image
                  src={formData.imagen_url}
                  alt="Vista previa de la imagen del programa"
                  fill
                  sizes="(max-width: 768px) 100vw, 500px"
                  className="object-cover"
                />
                <IconButton
                  icon={X}
                  label="Quitar imagen"
                  tone="danger"
                  onClick={() => setFormData((prev) => ({ ...prev, imagen_url: '' }))}
                  className="absolute right-2 top-2 bg-surface/90"
                />
              </div>
            ) : (
              <UploadButton
                endpoint="imageUploader"
                onClientUploadComplete={(res) => {
                  if (res && res[0]) {
                    setFormData((prev) => ({ ...prev, imagen_url: res[0].url }));
                    toast.success('Imagen cargada correctamente');
                  }
                }}
                onUploadError={(error) => toast.error(`Error al cargar imagen: ${error.message}`)}
                appearance={{
                  button: 'bg-brand text-bg hover:bg-brand-strong text-sm px-4 h-10 rounded-lg font-medium',
                  allowedContent: 'text-faint text-xs',
                }}
              />
            )}
          </div>

          <Checkbox
            label="Visible en el catálogo público"
            help="Si lo desmarcas, el programa deja de aparecer en /programas y nadie puede inscribirse. Los programas no se ocultan solos al terminar."
            checked={formData.activo}
            onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
          />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(aBorrar)}
        onClose={() => setABorrar(null)}
        onConfirm={handleDelete}
        loading={borrando}
        title={`¿Eliminar “${aBorrar?.nombre || ''}”?`}
        message="Se borra el programa completo de la base de datos."
        consequences={[
          `${aBorrar?.total_sesiones ?? 0} sesión(es) y toda su asistencia registrada`,
          `${aBorrar?.total_inscritos ?? 0} inscripción(es), incluidas las acreditaciones ya emitidas`,
          'Las evidencias (fotos y archivos) asociadas al programa',
        ]}
        confirmLabel="Eliminar programa"
      />
    </div>
  );
}
