'use client';

// Paso de PAGO del registro a un evento con costo (migración 013).
//
// Se abre justo después de que la inscripción queda guardada —individual, de
// invitado o de equipo— porque hasta ese momento no existe la inscripción a la
// que pertenece el comprobante. Ese es también el motivo de que la credencial
// sea el `qrToken` que devuelve el registro: quien paga puede no tener cuenta.
//
// Vive aquí y no dentro de cada página porque lo usan el detalle del evento y
// el listado, que son dos flujos de inscripción distintos con la misma regla.
import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { generateReactHelpers } from '@uploadthing/react';
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Receipt } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { TONO_COMPROBANTE, ETIQUETA_COMPROBANTE_INSCRITO } from '@/lib/comprobante-estado';

// Mismo motivo que en FlyerUploader: <UploadButton> depende de una hoja de
// estilos que el proyecto no importa y aparece como un input nativo en inglés.
const { useUploadThing } = generateReactHelpers();

const TIPOS_ACEPTADOS = 'image/png,image/jpeg,image/webp';
// El endpoint declara 8 MB: comprobarlo aquí evita subir 20 MB para que el
// servidor los rechace al final.
const MAX_BYTES = 8 * 1024 * 1024;

const formatearMonto = (valor) =>
  valor == null ? null : `$${Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;

/**
 * Bloque de estado del pago. Se reutiliza dentro del modal y en la ficha del
 * evento, para que el inscrito lea lo mismo en los dos sitios.
 */
export function EstadoPago({ comprobante, className = '' }) {
  if (!comprobante) return null;
  const estado = comprobante.estado || 'pendiente';

  return (
    <div className={`rounded-lg border border-line bg-surface-2 p-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Badge tone={TONO_COMPROBANTE[estado] || 'neutral'}>
          {ETIQUETA_COMPROBANTE_INSCRITO[estado] || estado}
        </Badge>
        {comprobante.referencia && (
          <span className="text-xs text-faint">Ref. {comprobante.referencia}</span>
        )}
      </div>
      {estado === 'pendiente' && (
        <p className="mt-2 text-xs text-muted">
          Un organizador lo revisará antes del evento. No hace falta que hagas nada más.
        </p>
      )}
      {estado === 'rechazado' && (
        <p className="mt-2 text-xs text-danger">
          {comprobante.motivo_rechazo || 'El comprobante no se pudo validar. Sube uno nuevo.'}
        </p>
      )}
      {estado === 'aprobado' && (
        <p className="mt-2 text-xs text-muted">Tu lugar está confirmado.</p>
      )}
    </div>
  );
}

/**
 * @param {object}   props
 * @param {boolean}  props.isOpen
 * @param {Function} props.onClose
 * @param {object}   props.evento         nombre, costo e instrucciones_pago
 * @param {string}   props.qrToken        credencial firmada de la inscripción
 * @param {object?}  props.comprobante    el que ya existe, si lo hay
 * @param {Function} props.onSaved        recibe el comprobante guardado
 * @param {boolean}  props.recienInscrito cambia el texto: registro recién hecho
 */
export default function ComprobantePagoModal({
  isOpen,
  onClose,
  evento,
  qrToken,
  comprobante = null,
  onSaved,
  recienInscrito = false,
}) {
  const inputRef = useRef(null);
  // El archivo y su URL de previsualización viajan juntos: así se revoca la
  // anterior en el mismo sitio donde se crea la nueva, sin un efecto que
  // persiga al estado.
  const [seleccion, setSeleccion] = useState(null); // { archivo, previa }
  // `null` significa "no lo ha tocado": el valor mostrado se DERIVA del
  // comprobante que ya existe o del costo del evento. Guardarlo en el estado
  // con un efecto obligaba a re-sincronizarlo cada vez que cambiaba el modal.
  const [referenciaEdit, setReferenciaEdit] = useState(null);
  const [montoEdit, setMontoEdit] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const archivo = seleccion?.archivo ?? null;
  const previa = seleccion?.previa ?? null;
  const referencia = referenciaEdit ?? (comprobante?.referencia || '');
  const monto = montoEdit ?? (
    comprobante?.monto_declarado != null
      ? String(comprobante.monto_declarado)
      : (evento?.costo != null ? String(evento.costo) : '')
  );

  const yaAprobado = comprobante?.estado === 'aprobado';

  const { startUpload, isUploading } = useUploadThing('comprobantePagoUploader', {
    onUploadError: (e) => setError(e?.message || 'No se pudo subir la imagen.'),
  });

  // Las URLs de objeto hay que revocarlas o la imagen queda retenida en memoria
  // mientras dure la pestaña. Se revoca al elegir otra y al desmontar; el ref
  // evita que la limpieza de desmontaje dependa del archivo actual.
  const seleccionRef = useRef(null);
  useEffect(() => () => {
    if (seleccionRef.current?.previa) URL.revokeObjectURL(seleccionRef.current.previa);
  }, []);

  const costoTexto = useMemo(() => formatearMonto(evento?.costo), [evento?.costo]);

  const elegirArchivo = (e) => {
    const seleccionado = e.target.files?.[0];
    // Se limpia el input para que volver a elegir el MISMO archivo dispare el
    // evento otra vez.
    e.target.value = '';
    if (!seleccionado) return;
    if (seleccionado.size > MAX_BYTES) {
      setError('La imagen supera los 8 MB. Toma la captura de nuevo o redúcela.');
      return;
    }
    if (seleccion?.previa) URL.revokeObjectURL(seleccion.previa);
    const nueva = { archivo: seleccionado, previa: URL.createObjectURL(seleccionado) };
    seleccionRef.current = nueva;
    setError(null);
    setSeleccion(nueva);
  };

  const enviar = async () => {
    if (!archivo) {
      setError('Selecciona la imagen de tu comprobante.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      // 1) El archivo va a UploadThing; el middleware valida ahí mismo el
      //    ticket de la inscripción antes de aceptarlo.
      const subidos = await startUpload([archivo], { qrToken });
      const subido = subidos?.[0];
      if (!subido) {
        // El mensaje real lo puso onUploadError.
        setGuardando(false);
        return;
      }

      // 2) La metadata la guarda nuestro endpoint, que es quien decide si esta
      //    inscripción puede tener comprobante y limpia el archivo anterior.
      const res = await fetch('/api/eventos/comprobante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken,
          imagen_url: subido.ufsUrl ?? subido.url,
          imagen_key: subido.key,
          nombre_archivo: subido.name,
          referencia: referencia.trim() || undefined,
          monto_declarado: monto === '' ? undefined : Number(monto),
        }),
      });
      const resultado = await res.json();
      if (!res.ok) throw new Error(resultado.error || 'No se pudo guardar el comprobante.');

      if (seleccion?.previa) URL.revokeObjectURL(seleccion.previa);
      seleccionRef.current = null;
      setSeleccion(null);
      setReferenciaEdit(null);
      setMontoEdit(null);
      onSaved?.(resultado.comprobante);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const ocupado = isUploading || guardando;

  return (
    <Modal
      isOpen={isOpen}
      onClose={ocupado ? () => {} : onClose}
      title={yaAprobado ? 'Pago validado' : 'Comprobante de pago'}
      description={evento?.nombre}
      size="lg"
      footer={
        yaAprobado ? (
          <Button onClick={onClose}>Entendido</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={ocupado}>
              {recienInscrito ? 'Subirlo después' : 'Cancelar'}
            </Button>
            <Button onClick={enviar} loading={ocupado} disabled={!archivo}>
              Enviar comprobante
            </Button>
          </>
        )
      }
    >
      {recienInscrito && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand/30 bg-brand-soft p-3 text-sm text-brand">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            Tu lugar quedó apartado. Se confirmará cuando validemos tu pago.
          </p>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-muted">
          <Receipt size={16} aria-hidden="true" />
          Costo de inscripción
        </span>
        <span className="text-lg font-bold text-fg">{costoTexto || 'Por definir'}</span>
      </div>

      {evento?.instrucciones_pago && (
        <div className="mb-4 rounded-lg border border-line bg-surface p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Cómo pagar</p>
          {/* Texto libre que teclea el admin: se pinta como texto plano
              respetando los saltos de línea, nunca como HTML. */}
          <p className="whitespace-pre-line text-sm text-muted">{evento.instrucciones_pago}</p>
        </div>
      )}

      <EstadoPago comprobante={comprobante} className="mb-4" />

      {!yaAprobado && (
        <>
          <p className="mb-3 text-sm text-muted">
            Sube una foto o captura del comprobante (transferencia, depósito o recibo). Lo revisará
            el equipo organizador.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept={TIPOS_ACEPTADOS}
            onChange={elegirArchivo}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={ocupado}
                onClick={() => inputRef.current?.click()}
              >
                <ImagePlus size={16} aria-hidden="true" />
                {archivo ? 'Cambiar imagen' : comprobante ? 'Subir otro comprobante' : 'Seleccionar imagen'}
              </Button>
              <p className="mt-1.5 text-xs text-faint">
                {archivo ? archivo.name : 'PNG, JPG o WebP · hasta 8 MB'}
              </p>
            </div>

            {previa ? (
              <Image
                src={previa}
                alt="Vista previa del comprobante"
                width={96}
                height={96}
                unoptimized
                className="h-24 w-24 shrink-0 rounded-lg border border-line object-cover"
              />
            ) : ocupado ? (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-faint">
                <Loader2 size={20} className="animate-spin" aria-hidden="true" />
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Referencia o folio"
              value={referencia}
              onChange={(e) => setReferenciaEdit(e.target.value)}
              placeholder="Opcional"
              maxLength={120}
            />
            <Input
              label="Monto pagado (MXN)"
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMontoEdit(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          {error && (
            <p className="mt-3 flex items-start gap-2 text-sm text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {recienInscrito && (
            <p className="mt-4 text-xs text-faint">
              Si no lo tienes a la mano, puedes subirlo más tarde desde la página del evento.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
