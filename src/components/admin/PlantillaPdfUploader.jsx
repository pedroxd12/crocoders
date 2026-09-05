'use client';

import { useRef, useState } from 'react';
import { FileUp, Loader2, FileText } from 'lucide-react';
import { generateReactHelpers } from '@uploadthing/react';
import Button from '@/components/ui/Button';

// Mismo enfoque que FlyerUploader: el hook de UploadThing con un control
// propio (el <UploadButton> del paquete necesita su hoja de estilos y se
// pintaba doble). El endpoint `plantillaPdfUploader` exige rol administrador.
const { useUploadThing } = generateReactHelpers();

/**
 * Sube el PDF de diseño de una plantilla. `onChange({ url, key, nombre })`
 * recibe el archivo ya en el CDN; `archivo` es el nombre actual (si hay).
 */
export default function PlantillaPdfUploader({ archivo, onChange, onError }) {
  const inputRef = useRef(null);
  const [errorLocal, setErrorLocal] = useState(null);

  const { startUpload, isUploading } = useUploadThing('plantillaPdfUploader', {
    onClientUploadComplete: (res) => {
      const f = res?.[0];
      if (!f) return;
      onChange({ url: f.ufsUrl ?? f.url ?? null, key: f.key ?? null, nombre: f.name ?? 'plantilla.pdf' });
    },
    onUploadError: (error) => {
      const mensaje = error?.message || 'No se pudo subir el PDF.';
      setErrorLocal(mensaje);
      onError?.(mensaje);
    },
  });

  const seleccionar = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      const mensaje = 'La plantilla debe ser un archivo PDF.';
      setErrorLocal(mensaje);
      onError?.(mensaje);
      return;
    }
    setErrorLocal(null);
    startUpload([f]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={seleccionar}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <Button type="button" variant="secondary" size="sm" loading={isUploading} onClick={() => inputRef.current?.click()}>
          {!isUploading && <FileUp size={16} aria-hidden="true" />}
          {isUploading ? 'Subiendo…' : archivo ? 'Cambiar PDF' : 'Subir PDF de diseño'}
        </Button>
        {archivo && !isUploading && (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <FileText size={14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{archivo}</span>
          </span>
        )}
        {isUploading && <Loader2 size={16} className="animate-spin text-faint" aria-hidden="true" />}
      </div>
      <p className="text-xs text-faint">
        PDF hasta 8 MB. Diseña el certificado o gafete con tu herramienta favorita y deja libres los espacios
        donde irán los datos.
      </p>
      {errorLocal && <p className="text-xs text-danger">{errorLocal}</p>}
    </div>
  );
}
