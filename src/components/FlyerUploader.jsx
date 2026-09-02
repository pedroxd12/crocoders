'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { generateReactHelpers } from '@uploadthing/react';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';

// PORQUÉ NO SE USA <UploadButton>
// -------------------------------
// `UploadButton` de @uploadthing/react depende de la hoja de estilos del
// paquete (`@uploadthing/react/styles.css`), que este proyecto no importa. Sin
// ella, el <input type="file"> que el componente esconde con `sr-only` queda
// VISIBLE, así que el admin veía dos controles superpuestos y en dos idiomas:
// el nativo del navegador ("Elegir archivos / Sin archivos seleccionados") y la
// etiqueta del componente en inglés ("Choose File(s)"), sin el fondo verde
// porque las variantes `ut-*` tampoco se compilan.
//
// Aquí se usa el hook `useUploadThing` directamente: la subida es la misma (el
// endpoint `eventoImageUploader` sigue exigiendo rol administrador) pero el
// control es nuestro, en español y con los tokens del sistema de diseño.
const { useUploadThing } = generateReactHelpers();

const TIPOS_ACEPTADOS = 'image/png,image/jpeg,image/webp';

/**
 * `nombre` sólo cambia las etiquetas ("Subir flyer" / "Subir imagen del reto"):
 * el uploader es el mismo y sigue apuntando al endpoint `eventoImageUploader`,
 * que exige rol administrador.
 */
export default function FlyerUploader({ url, onChange, onError, nombre = 'flyer' }) {
  const inputRef = useRef(null);
  const [errorLocal, setErrorLocal] = useState(null);

  const { startUpload, isUploading } = useUploadThing('eventoImageUploader', {
    onClientUploadComplete: (res) => {
      const archivo = res?.[0];
      if (!archivo) return;
      // `ufsUrl` es el campo actual de UploadThing v7; `url` queda como
      // respaldo por si el servidor devuelve la forma antigua.
      onChange({ url: archivo.ufsUrl ?? archivo.url ?? null, key: archivo.key ?? null });
    },
    onUploadError: (error) => {
      const mensaje = error?.message || 'No se pudo subir la imagen.';
      setErrorLocal(mensaje);
      onError?.(mensaje);
    },
  });

  const seleccionar = (e) => {
    const archivo = e.target.files?.[0];
    // Se limpia el input para que volver a elegir el MISMO archivo dispare el
    // evento otra vez (si no, `change` no salta y parece que no pasa nada).
    e.target.value = '';
    if (!archivo) return;
    setErrorLocal(null);
    startUpload([archivo]);
  };

  const quitar = () => {
    setErrorLocal(null);
    // `key: null` es explícito: le dice al PUT que borre también el archivo del
    // CDN. Distinto de "no mandar el campo", que significa "no lo toques".
    onChange({ url: null, key: null });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            ref={inputRef}
            type="file"
            accept={TIPOS_ACEPTADOS}
            onChange={seleccionar}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {!isUploading && <ImagePlus size={16} aria-hidden="true" />}
            {isUploading ? 'Subiendo…' : url ? `Cambiar ${nombre}` : `Subir ${nombre}`}
          </Button>
          <p className="mt-1.5 text-xs text-faint">PNG, JPG o WebP · hasta 4 MB</p>
        </div>

        {url && (
          <div className="relative shrink-0">
            <Image
              src={url}
              alt={`Vista previa: ${nombre}`}
              width={80}
              height={80}
              className="h-20 w-20 rounded-lg border border-line object-cover"
            />
            <IconButton
              icon={Trash2}
              label={`Quitar ${nombre}`}
              tone="danger"
              size={14}
              onClick={quitar}
              className="absolute -right-2 -top-2 h-7 w-7 border border-line bg-surface"
            />
          </div>
        )}

        {isUploading && !url && (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-faint">
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>

      {errorLocal && <p className="text-xs text-danger">{errorLocal}</p>}
    </div>
  );
}
