// src/app/admin/evidencias/page.jsx
'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ImageOff, Plus } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { UploadButton } from '@/utils/uploadthing';

const DESTINOS = [
  { key: 'evento', label: 'Eventos' },
  { key: 'programa', label: 'Programas y talleres' },
];

export default function EvidenciasAdmin() {
  // Destino: 'evento' | 'programa'. El admin sube evidencias a uno u otro.
  const [targetType, setTargetType] = useState('evento');
  // selected = { tipo, id, nombre } o null
  const [selected, setSelected] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [nombreEvidencia, setNombreEvidencia] = useState('');
  const [uploadedFileDetails, setUploadedFileDetails] = useState(null);
  const [guardandoSubida, setGuardandoSubida] = useState(false);
  const [editing, setEditing] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  // Una evidencia concreta, no un flag global: antes borrar una convertía en
  // spinner los botones "Eliminar" de TODAS las tarjetas a la vez.
  const [aEliminar, setAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  // Eventos y programas por separado: que uno falle o tarde no deja el otro
  // selector vacío, y ambas listas quedan en la caché compartida con el resto
  // del panel.
  const { data: eventosRaw, isLoading: cargandoEventos } = useSWR('/api/admin/eventos', fetcher, {
    revalidateOnFocus: false,
    onError: () => toast.error('No se pudieron cargar los eventos.'),
  });
  const { data: programasRaw, isLoading: cargandoProgramas } = useSWR('/api/admin/programas', fetcher, {
    revalidateOnFocus: false,
    onError: () => toast.error('No se pudieron cargar los programas.'),
  });

  const eventos = useMemo(
    () =>
      (Array.isArray(eventosRaw) ? eventosRaw : []).map((ev) => ({
        id: ev.id_evento,
        nombre: ev.nombre_evento ?? ev.nombre,
        fecha: ev.fecha ?? ev.fecha_inicio,
      })),
    [eventosRaw],
  );

  const programas = useMemo(
    () =>
      (Array.isArray(programasRaw) ? programasRaw : []).map((pr) => ({
        id: pr.id_programa,
        nombre: pr.nombre,
        fecha: pr.fecha_inicio,
      })),
    [programasRaw],
  );

  const opciones = targetType === 'evento' ? eventos : programas;
  const cargandoOpciones = targetType === 'evento' ? cargandoEventos : cargandoProgramas;

  const evidenciasKey = selected
    ? `/api/evidencias?${selected.tipo === 'evento' ? 'evento' : 'programa'}=${selected.id}`
    : null;
  const {
    data: evidencias = [],
    isLoading: cargandoEvidencias,
    mutate: refrescarEvidencias,
  } = useSWR(evidenciasKey, fetcher, {
    keepPreviousData: false,
    revalidateOnFocus: false,
    onError: (e) => toast.error(e.message || 'Error al cargar evidencias'),
  });

  const cambiarDestino = (key) => {
    setTargetType(key);
    setSelected(null);
  };

  const handleSelectChange = (e) => {
    const id = e.target.value;
    if (!id) {
      setSelected(null);
      return;
    }
    const item = opciones.find((o) => String(o.id) === id);
    if (item) setSelected({ tipo: targetType, id: item.id, nombre: item.nombre });
  };

  const resetUploadModal = () => {
    setShowUploadModal(false);
    setNombreEvidencia('');
    setUploadedFileDetails(null);
  };

  const handleSaveEvidence = async () => {
    if (!selected || !uploadedFileDetails) {
      toast.error('Selecciona un destino y sube una imagen.');
      return;
    }
    setGuardandoSubida(true);
    try {
      const payload = {
        // Enviar id_evento o id_programa según el destino (el backend exige XOR).
        ...(selected.tipo === 'evento' ? { id_evento: selected.id } : { id_programa: selected.id }),
        nombre: nombreEvidencia || uploadedFileDetails.name || 'Evidencia',
        imagen_url: uploadedFileDetails.url,
        imagen_key: uploadedFileDetails.key,
      };
      const res = await fetch('/api/evidencias/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar la evidencia');
      }
      const nueva = await res.json();
      // Se añade la nueva a lo que ya hay en pantalla y se revalida detrás: la
      // rejilla no parpadea a vacío tras subir.
      await refrescarEvidencias((actuales = []) => [...actuales, nueva], { revalidate: true });
      toast.success('Evidencia guardada correctamente');
      resetUploadModal();
    } catch (error) {
      toast.error(`Error al guardar evidencia: ${error.message}`);
    } finally {
      setGuardandoSubida(false);
    }
  };

  const confirmarEliminacion = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      const res = await fetch(`/api/evidencias/${aEliminar.id_evidencia}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al eliminar evidencia');
      }
      await refrescarEvidencias(
        (actuales = []) => actuales.filter((e) => e.id_evidencia !== aEliminar.id_evidencia),
        { revalidate: true },
      );
      toast.success('Evidencia eliminada correctamente');
      setAEliminar(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEliminando(false);
    }
  };

  const openEdit = (evidencia) => {
    setEditing({
      id_evidencia: evidencia.id_evidencia,
      titulo: evidencia.nombre || '',
      descripcion: evidencia.descripcion || '',
      orden: evidencia.orden ?? 0,
      publica: evidencia.publica ?? true,
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!editing.titulo.trim()) {
      toast.error('El título no puede estar vacío.');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/evidencias/${editing.id_evidencia}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: editing.titulo.trim(),
          descripcion: editing.descripcion,
          orden: Number(editing.orden) || 0,
          publica: editing.publica,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al actualizar evidencia');
      }
      const actualizada = await res.json();
      await refrescarEvidencias(
        (actuales = []) =>
          actuales
            .map((e) => (e.id_evidencia === actualizada.id_evidencia ? actualizada : e))
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
        { revalidate: true },
      );
      toast.success('Evidencia actualizada');
      setEditing(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const opcionesSelect = opciones.map((o) => ({
    value: String(o.id),
    label: `${o.nombre}${o.fecha ? ` — ${new Date(o.fecha).toLocaleDateString('es-MX')}` : ''}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evidencias"
        description="Fotografías publicadas en la galería de cada evento o programa."
        actions={
          selected ? (
            <Button onClick={() => setShowUploadModal(true)}>
              <Plus size={16} aria-hidden="true" />
              Añadir evidencia
            </Button>
          ) : null
        }
      />

      {/* Selector de tipo de destino */}
      <div className="flex flex-wrap items-end gap-4">
        <div
          className="inline-flex rounded-lg border border-line bg-surface-2 p-1"
          role="tablist"
          aria-label="Tipo de destino"
        >
          {DESTINOS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={targetType === t.key}
              onClick={() => cambiarDestino(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                targetType === t.key ? 'bg-surface text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Select
          label={targetType === 'evento' ? 'Evento' : 'Programa'}
          value={selected ? String(selected.id) : ''}
          onChange={handleSelectChange}
          options={opcionesSelect}
          placeholder={cargandoOpciones ? 'Cargando…' : `Selecciona un ${targetType}`}
          disabled={cargandoOpciones}
          wrapperClassName="w-full sm:w-96"
          help={
            !cargandoOpciones && opciones.length === 0
              ? `No hay ${targetType === 'evento' ? 'eventos' : 'programas'} disponibles.`
              : undefined
          }
        />
      </div>

      {!selected ? (
        <EmptyState
          icon={ImageOff}
          title="Selecciona un destino"
          description="Elige un evento o programa para ver y gestionar sus evidencias."
        />
      ) : cargandoEvidencias ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : evidencias.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {evidencias.map((evidencia) => (
            <article
              key={evidencia.id_evidencia}
              className="overflow-hidden rounded-xl border border-line bg-surface"
            >
              <div className="relative h-44 w-full bg-surface-2">
                <Image
                  src={evidencia.imagen_url}
                  alt={evidencia.nombre || 'Evidencia'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              </div>
              <div className="p-4">
                <h3 className="truncate text-sm font-medium text-fg" title={evidencia.nombre}>
                  {evidencia.nombre || 'Evidencia sin nombre'}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-faint">Orden {evidencia.orden ?? 0}</span>
                  {evidencia.publica === false && <Badge tone="warning" size="sm">Oculta</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">
                  Subida el {new Date(evidencia.fecha).toLocaleDateString('es-MX')}
                </p>
                <div className="mt-3 flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(evidencia)}>
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    color="red"
                    size="sm"
                    onClick={() => setAEliminar(evidencia)}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ImageOff}
          title={`Sin evidencias para "${selected.nombre}"`}
          description="Sube la primera fotografía para que aparezca en la galería pública."
          action={
            <Button onClick={() => setShowUploadModal(true)}>
              <Plus size={16} aria-hidden="true" />
              Subir primera evidencia
            </Button>
          }
        />
      )}

      <Modal
        isOpen={showUploadModal}
        onClose={resetUploadModal}
        title="Subir evidencia"
        description={selected?.nombre}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={resetUploadModal} disabled={guardandoSubida}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEvidence} loading={guardandoSubida} disabled={!uploadedFileDetails}>
              Guardar evidencia
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nombre o descripción"
            type="text"
            value={nombreEvidencia}
            onChange={(e) => setNombreEvidencia(e.target.value)}
            placeholder="Ej: Premiación del concurso"
            maxLength={100}
            help="Opcional. Si lo dejas vacío se usa el nombre del archivo."
          />

          <div>
            <p className="mb-1.5 block text-sm font-medium text-muted">Archivo de imagen</p>
            <UploadButton
              endpoint="evidenciaUploader"
              onClientUploadComplete={(res) => {
                if (res && res.length > 0) {
                  toast.success('Imagen subida. Ahora puedes guardarla.');
                  setUploadedFileDetails({ url: res[0].url, key: res[0].key, name: res[0].name });
                }
              }}
              onUploadError={(error) => toast.error(`Error al subir: ${error.message}`)}
              className="ut-button:bg-brand ut-button:text-bg ut-button:text-sm ut-allowed-content:text-faint"
            />
            {uploadedFileDetails && (
              <div className="mt-3 flex items-center gap-3">
                <Image
                  src={uploadedFileDetails.url}
                  alt="Previsualización"
                  width={64}
                  height={64}
                  className="rounded-lg border border-line object-cover"
                />
                <p className="text-sm text-muted">
                  Lista para guardar: <span className="text-fg">{uploadedFileDetails.name}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title="Editar evidencia"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={savingEdit}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} loading={savingEdit}>
              Guardar cambios
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Input
              label="Título"
              type="text"
              value={editing.titulo}
              onChange={(e) => setEditing({ ...editing, titulo: e.target.value })}
              maxLength={255}
              required
            />
            <Textarea
              label="Descripción"
              value={editing.descripcion}
              onChange={(e) => setEditing({ ...editing, descripcion: e.target.value })}
              maxLength={2000}
              rows={3}
              help="Opcional. Se muestra bajo la imagen en la galería pública."
            />
            <div className="flex flex-wrap items-end gap-6">
              <Input
                label="Orden"
                type="number"
                min={0}
                value={editing.orden}
                onChange={(e) => setEditing({ ...editing, orden: e.target.value })}
                wrapperClassName="w-28"
                help="Menor primero"
              />
              <label className="flex items-center gap-2 pb-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={editing.publica}
                  onChange={(e) => setEditing({ ...editing, publica: e.target.checked })}
                  className="h-4 w-4 accent-brand"
                />
                Visible al público
              </label>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!aEliminar}
        onClose={() => (eliminando ? null : setAEliminar(null))}
        onConfirm={confirmarEliminacion}
        loading={eliminando}
        title={`¿Eliminar "${aEliminar?.nombre || 'esta evidencia'}"?`}
        message="Se borra la fotografía del sistema y del almacenamiento."
        consequences={[
          'Desaparece de la galería pública del evento o programa.',
          'El archivo de imagen se elimina y el enlace deja de funcionar.',
        ]}
        confirmLabel="Eliminar evidencia"
      />
    </div>
  );
}
