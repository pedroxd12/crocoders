// src/app/admin/evidencias/page.jsx
'use client';

import { useState, useEffect } from 'react';
// import { useRouter } from 'next/navigation'; // Not strictly used here, but good to keep if navigation might be added
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Modal from '@/components/ui/Modal';
import Image from 'next/image'; // Ensure this import is present
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/LoadingSpinner';
import { UploadButton } from "@/utils/uploadthing";

export default function EvidenciasAdmin() {
  const [eventos, setEventos] = useState([]);
  const [evidencias, setEvidencias] = useState([]);
  const [loading, setLoading] = useState({
    eventos: true,
    evidencias: false,
    upload: false, // For the process of saving after UploadThing finishes
    delete: false
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [nombreEvidencia, setNombreEvidencia] = useState('');
  const [uploadedFileDetails, setUploadedFileDetails] = useState(null); // Stores {url, key, name} from UploadThing

  useEffect(() => {
    fetchEventos();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      fetchEvidencias(selectedEvent);
    } else {
      setEvidencias([]);
    }
  }, [selectedEvent]);

  const fetchEventos = async () => {
    setLoading(prev => ({ ...prev, eventos: true }));
    try {
      const res = await fetch('/api/admin/eventos'); 
      if (!res.ok) throw new Error('Error al cargar eventos');
      const data = await res.json();
      setEventos(data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(prev => ({ ...prev, eventos: false }));
    }
  };

  const fetchEvidencias = async (evento) => {
    setLoading(prev => ({ ...prev, evidencias: true }));
    try {
      const res = await fetch(`/api/evidencias?evento=${evento.id_evento}`);
      if (!res.ok) throw new Error('Error al cargar evidencias');
      const data = await res.json();
      setEvidencias(data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(prev => ({ ...prev, evidencias: false }));
    }
  };

  const handleSaveEvidenceWithUploadThing = async () => {
    if (!selectedEvent || !uploadedFileDetails) {
        toast.error("Por favor, selecciona un evento y sube una imagen.");
        return;
    }
    setLoading(prev => ({ ...prev, upload: true }));
    try {
      const payload = {
        id_evento: selectedEvent.id_evento,
        nombre: nombreEvidencia || uploadedFileDetails.name || 'Evidencia', // Use UT file name if local name is empty
        imagen_url: uploadedFileDetails.url,
        imagen_key: uploadedFileDetails.key
      };

      const res = await fetch('/api/evidencias/upload', { // Backend endpoint to save metadata
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al guardar la metadata de la evidencia');
      }
      const nuevaEvidencia = await res.json();
      setEvidencias(prev => [...prev, nuevaEvidencia]);
      toast.success('Evidencia guardada correctamente');
      resetUploadModal();
    } catch (error) {
      toast.error(`Error al guardar evidencia: ${error.message}`);
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
    }
  };

  const handleDelete = async (id_evidencia) => {
    if (!confirm('¿Estás seguro de eliminar esta evidencia? Esta acción no se puede deshacer.')) return;
    setLoading(prev => ({ ...prev, delete: true }));
    try {
      const res = await fetch(`/api/evidencias/${id_evidencia}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al eliminar evidencia');
      }
      setEvidencias(prev => prev.filter(e => e.id_evidencia !== id_evidencia));
      toast.success('Evidencia eliminada correctamente');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(prev => ({ ...prev, delete: false }));
    }
  };

  const resetUploadModal = () => {
    setShowUploadModal(false);
    setNombreEvidencia('');
    setUploadedFileDetails(null); // Clear details of the uploaded file
  };

  return (
    <div className="p-4 md:p-6">
      <h2 className="text-2xl font-bold mb-6 text-green-400">Gestión de Evidencias</h2>
      
      <div className="mb-6">
        <label className="block text-gray-300 mb-2">Seleccionar Evento:</label>
        <select
          className="w-full bg-gray-700 border border-gray-600 rounded p-2.5 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          value={selectedEvent?.id_evento || ''}
          onChange={(e) => {
            const eventoId = e.target.value;
            setSelectedEvent(eventos.find(ev => ev.id_evento.toString() === eventoId) || null);
          }}
          disabled={loading.eventos}
        >
          <option value="">-- Selecciona un evento --</option>
          {loading.eventos ? (
            <option disabled>Cargando eventos...</option>
          ) : (
            eventos.map(evento => (
              <option key={evento.id_evento} value={evento.id_evento}>
                {evento.nombre_evento} - {new Date(evento.fecha).toLocaleDateString('es-ES')}
              </option>
            ))
          )}
        </select>
      </div>

      {selectedEvent && (
        <div className="bg-gray-800 rounded-lg p-4 md:p-6 shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <h3 className="text-xl font-semibold">
              Evidencias para: <span className="text-green-400">{selectedEvent.nombre_evento}</span>
            </h3>
            <Button onClick={() => setShowUploadModal(true)} variant="primary" disabled={loading.evidencias || loading.eventos}>
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
                    <h4 className="font-medium mb-2 truncate" title={evidencia.nombre}>{evidencia.nombre || 'Evidencia sin nombre'}</h4>
                    <p className="text-gray-400 text-sm mb-3">Subido: {new Date(evidencia.fecha).toLocaleString('es-ES')}</p>
                    <div className="flex justify-end">
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
              <p className="text-gray-400 mb-4">No hay evidencias para este evento.</p>
              <Button onClick={() => setShowUploadModal(true)} variant="primary">Subir primera evidencia</Button>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showUploadModal} onClose={resetUploadModal} title={`Subir Evidencia para ${selectedEvent?.nombre_evento || ''}`}>
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
                endpoint="evidenciaUploader" // Ensure this matches your core.js
                onClientUploadComplete={(res) => {
                    if (res && res.length > 0) {
                        toast.success("Imagen subida. Ahora puedes guardarla.");
                        setUploadedFileDetails({ 
                            url: res[0].url, 
                            key: res[0].key,
                            name: res[0].name // Original file name from UploadThing
                        });
                    }
                }}
                onUploadError={(error) => {
                    toast.error(`Error al subir: ${error.message}`);
                }}
                className="mt-1 ut-button:bg-green-600 ut-button:ut-hover:bg-green-700 ut-button:text-slate-50 ut-allowed-content:text-gray-400"
            />
            {uploadedFileDetails && (
                <div className="mt-3">
                    <p className="text-sm text-green-400">Imagen lista: {uploadedFileDetails.name}</p>
                    <Image src={uploadedFileDetails.url} alt="Previsualización" width={100} height={100} className="rounded mt-1 border border-gray-600"/>
                </div>
            )}
          </div>
          
          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" onClick={resetUploadModal} variant="secondary" disabled={loading.upload}>Cancelar</Button>
            <Button 
                onClick={handleSaveEvidenceWithUploadThing} 
                variant="primary" 
                disabled={loading.upload || !uploadedFileDetails} // Disable if no file uploaded or currently saving
            >
              {loading.upload ? <LoadingSpinner size="sm" /> : 'Guardar Evidencia'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}