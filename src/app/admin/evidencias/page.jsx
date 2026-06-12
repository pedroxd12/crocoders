// src/app/admin/evidencias/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Modal from '@/components/ui/Modal';
import Image from 'next/image';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/LoadingSpinner';
import { UploadButton } from "@/utils/uploadthing";

export default function EvidenciasAdmin() {
  // Destino: 'evento' | 'programa'. El admin sube evidencias a uno u otro.
  const [targetType, setTargetType] = useState('evento');
  const [eventos, setEventos] = useState([]);
  const [programas, setProgramas] = useState([]);
  const [evidencias, setEvidencias] = useState([]);
  const [loading, setLoading] = useState({ targets: true, evidencias: false, upload: false, delete: false });
  // selected = { tipo, id, nombre } o null
  const [selected, setSelected] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [nombreEvidencia, setNombreEvidencia] = useState('');
  const [uploadedFileDetails, setUploadedFileDetails] = useState(null);
  const [editing, setEditing] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchTargets();
  }, []);

  // Al cambiar de tipo de destino, limpiar la selección actual.
  useEffect(() => {
    setSelected(null);
    setEvidencias([]);
  }, [targetType]);

  useEffect(() => {
    if (selected) fetchEvidencias(selected);
    else setEvidencias([]);
  }, [selected]);

  const fetchTargets = async () => {
    setLoading(prev => ({ ...prev, targets: true }));
    // Cargar eventos y programas de forma INDEPENDIENTE: que uno lento o que
    // falle no bloquee al otro (antes un Promise.all hacía que cualquier fallo
    // dejara ambos selectores vacíos).
    const [evResult, prResult] = await Promise.allSettled([
      fetch('/api/admin/eventos').then(r => { if (!r.ok) throw new Error('eventos'); return r.json(); }),
      fetch('/api/admin/programas').then(r => { if (!r.ok) throw new Error('programas'); return r.json(); }),
    ]);

    if (evResult.status === 'fulfilled') {
      const evData = evResult.value;
      setEventos((Array.isArray(evData) ? evData : []).map(ev => ({
        id: ev.id_evento,
        nombre: ev.nombre_evento ?? ev.nombre,
        fecha: ev.fecha ?? ev.fecha_inicio,
      })));
    } else {
      toast.error('No se pudieron cargar los eventos.');
    }

    if (prResult.status === 'fulfilled') {
      const prData = prResult.value;
      setProgramas((Array.isArray(prData) ? prData : []).map(pr => ({
        id: pr.id_programa,
        nombre: pr.nombre,
        fecha: pr.fecha_inicio,
      })));
    } else {
      toast.error('No se pudieron cargar los programas.');
    }

    setLoading(prev => ({ ...prev, targets: false }));
  };

  const fetchEvidencias = async (target) => {
    setLoading(prev => ({ ...prev, evidencias: true }));
    try {
      const qs = target.tipo === 'evento' ? `evento=${target.id}` : `programa=${target.id}`;
      const res = await fetch(`/api/evidencias?${qs}`);
      if (!res.ok) throw new Error('Error al cargar evidencias');
      setEvidencias(await res.json());
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(prev => ({ ...prev, evidencias: false }));
    }
  };

  const opciones = targetType === 'evento' ? eventos : programas;

  const handleSelectChange = (e) => {
    const id = e.target.value;
    if (!id) { setSelected(null); return; }
    const item = opciones.find(o => o.id.toString() === id);
    if (item) setSelected({ tipo: targetType, id: item.id, nombre: item.nombre });
  };

  const handleSaveEvidenceWithUploadThing = async () => {
    if (!selected || !uploadedFileDetails) {
      toast.error('Selecciona un destino y sube una imagen.');
      return;
    }
    setLoading(prev => ({ ...prev, upload: true }));
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
      setEvidencias(prev => [...prev, nueva]);
      toast.success('Evidencia guardada correctamente');
      resetUploadModal();
    } catch (error) {
      toast.error(`Error al guardar evidencia: ${error.message}`);
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
    }
  };

  const handleDelete = async (id_evidencia) => {
    if (!confirm('¿Eliminar esta evidencia? Esta acción no se puede deshacer.')) return;
    setLoading(prev => ({ ...prev, delete: true }));
    try {
      const res = await fetch(`/api/evidencias/${id_evidencia}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al eliminar evidencia');
      }
      setEvidencias(prev => prev.filter(e => e.id_evidencia !== id_evidencia));
      toast.success('Evidencia eliminada correctamente');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(prev => ({ ...prev, delete: false }));
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
    if (!editing.titulo.trim()) { toast.error('El título no puede estar vacío.'); return; }
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
      setEvidencias(prev =>
        prev.map(e => (e.id_evidencia === actualizada.id_evidencia ? actualizada : e))
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      );
      toast.success('Evidencia actualizada');
      setEditing(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const resetUploadModal = () => {
    setShowUploadModal(false);
    setNombreEvidencia('');
    setUploadedFileDetails(null);
  };

  return (
    <div className="p-4 md:p-6">
      <h2 className="text-2xl font-bold mb-6 text-green-400">Gestión de Evidencias</h2>

      {/* Selector de tipo de destino: Evento o Programa */}
      <div className="mb-4 flex gap-2">
        {[
          { key: 'evento', label: 'Eventos' },
          { key: 'programa', label: 'Programas / Talleres' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTargetType(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              targetType === t.key
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-6">
        <label className="block text-gray-300 mb-2">
          {targetType === 'evento' ? 'Seleccionar Evento:' : 'Seleccionar Programa:'}
        </label>
        <select
          className="w-full bg-gray-700 border border-gray-600 rounded p-2.5 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          value={selected?.id || ''}
          onChange={handleSelectChange}
          disabled={loading.targets}
        >
          <option value="">
            {targetType === 'evento' ? '-- Selecciona un evento --' : '-- Selecciona un programa --'}
          </option>
          {loading.targets ? (
            <option disabled>Cargando...</option>
          ) : (
            opciones.map(o => (
              <option key={o.id} value={o.id}>
                {o.nombre}{o.fecha ? ` - ${new Date(o.fecha).toLocaleDateString('es-ES')}` : ''}
              </option>
            ))
          )}
        </select>
        {!loading.targets && opciones.length === 0 && (
          <p className="text-sm text-gray-500 mt-2">
            No hay {targetType === 'evento' ? 'eventos' : 'programas'} disponibles.
          </p>
        )}
      </div>

      {selected && (
        <div className="bg-gray-800 rounded-lg p-4 md:p-6 shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <h3 className="text-xl font-semibold">
              Evidencias para: <span className="text-green-400">{selected.nombre}</span>
            </h3>
            <Button onClick={() => setShowUploadModal(true)} variant="primary" disabled={loading.evidencias || loading.targets}>
              + Añadir Evidencia
            </Button>
          </div>

          {loading.evidencias ? (
            <div className="text-center py-12"><LoadingSpinner text="Cargando evidencias..." /></div>
          ) : evidencias.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {evidencias.map(evidencia => (
                <div key={evidencia.id_evidencia} className="bg-gray-700 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
                  <div className="relative h-48 w-full">
                    <Image
                      src={evidencia.imagen_url}
                      alt={evidencia.nombre || 'Evidencia'}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      onError={(e) => e.target.src = '/placeholder-event.jpg'}
                    />
                  </div>
                  <div className="p-4">
                    <h4 className="font-medium mb-1 truncate" title={evidencia.nombre}>{evidencia.nombre || 'Evidencia sin nombre'}</h4>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-gray-500">Orden: {evidencia.orden ?? 0}</span>
                      {evidencia.publica === false && (
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">Oculta</span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mb-3">Subido: {new Date(evidencia.fecha).toLocaleString('es-ES')}</p>
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => openEdit(evidencia)} variant="text" size="sm">Editar</Button>
                      <Button onClick={() => handleDelete(evidencia.id_evidencia)} variant="text" color="red" size="sm" disabled={loading.delete}>
                        {loading.delete ? <LoadingSpinner size="sm" /> : 'Eliminar'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-700/50 rounded-lg p-8 text-center border border-gray-600">
              <p className="text-gray-400 mb-4">No hay evidencias para {selected.tipo === 'evento' ? 'este evento' : 'este programa'}.</p>
              <Button onClick={() => setShowUploadModal(true)} variant="primary">Subir primera evidencia</Button>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showUploadModal} onClose={resetUploadModal} title={`Subir Evidencia para ${selected?.nombre || ''}`}>
        <div className="space-y-4">
          <Input
            label="Nombre o descripción (opcional):"
            type="text"
            value={nombreEvidencia}
            onChange={(e) => setNombreEvidencia(e.target.value)}
            placeholder="Ej: Premiación del concurso"
            maxLength={100}
            className="bg-gray-700 border-gray-600 focus:border-green-500"
          />

          <div>
            <label className="block text-gray-300 mb-2">Archivo de Imagen:</label>
            <UploadButton
              endpoint="evidenciaUploader"
              onClientUploadComplete={(res) => {
                if (res && res.length > 0) {
                  toast.success('Imagen subida. Ahora puedes guardarla.');
                  setUploadedFileDetails({ url: res[0].url, key: res[0].key, name: res[0].name });
                }
              }}
              onUploadError={(error) => toast.error(`Error al subir: ${error.message}`)}
              className="mt-1 ut-button:bg-green-600 ut-button:ut-hover:bg-green-700 ut-button:text-slate-50 ut-allowed-content:text-gray-400"
            />
            {uploadedFileDetails && (
              <div className="mt-3">
                <p className="text-sm text-green-400">Imagen lista: {uploadedFileDetails.name}</p>
                <Image src={uploadedFileDetails.url} alt="Previsualización" width={100} height={100} className="rounded mt-1 border border-gray-600" />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" onClick={resetUploadModal} variant="secondary" disabled={loading.upload}>Cancelar</Button>
            <Button onClick={handleSaveEvidenceWithUploadThing} variant="primary" disabled={loading.upload || !uploadedFileDetails}>
              {loading.upload ? <LoadingSpinner size="sm" /> : 'Guardar Evidencia'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Editar Evidencia">
        {editing && (
          <div className="space-y-4">
            <Input
              label="Título"
              type="text"
              value={editing.titulo}
              onChange={(e) => setEditing({ ...editing, titulo: e.target.value })}
              maxLength={255}
              className="bg-gray-700 border-gray-600 focus:border-green-500"
            />
            <div>
              <label className="block text-gray-300 mb-2 text-sm">Descripción (opcional):</label>
              <textarea
                value={editing.descripcion}
                onChange={(e) => setEditing({ ...editing, descripcion: e.target.value })}
                maxLength={2000}
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded p-2.5 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="flex gap-4">
              <Input
                label="Orden"
                type="number"
                min={0}
                value={editing.orden}
                onChange={(e) => setEditing({ ...editing, orden: e.target.value })}
                className="bg-gray-700 border-gray-600 focus:border-green-500 w-28"
              />
              <label className="flex items-center gap-2 text-gray-300 text-sm mt-7">
                <input
                  type="checkbox"
                  checked={editing.publica}
                  onChange={(e) => setEditing({ ...editing, publica: e.target.checked })}
                  className="h-4 w-4 accent-green-500"
                />
                Visible al público
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-3">
              <Button type="button" onClick={() => setEditing(null)} variant="secondary" disabled={savingEdit}>Cancelar</Button>
              <Button onClick={handleSaveEdit} variant="primary" disabled={savingEdit}>
                {savingEdit ? <LoadingSpinner size="sm" /> : 'Guardar Cambios'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
