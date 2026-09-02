'use client';

// Revisión del comprobante de pago de UNA inscripción.
//
// Lo comparten el panel de administración y el de staff: los dos ven la misma
// imagen, con los mismos botones, contra el mismo endpoint
// (PATCH /api/eventos/comprobantes/[id], que autoriza a un administrador o al
// staff asignado a ese evento). Vive en components/eventos y no en
// components/admin justamente porque no es exclusivo del panel admin.
import { useState } from 'react';
import Image from 'next/image';
import { toast } from 'react-toastify';
import { Check, ExternalLink, ImageOff, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Textarea from '@/components/ui/Textarea';
import EmptyState from '@/components/ui/EmptyState';
import { TONO_COMPROBANTE, ETIQUETA_COMPROBANTE } from '@/lib/comprobante-estado';
import { formatearFechaHora } from '@/lib/fechas';

const formatearMonto = (valor) =>
  valor == null ? null : `$${Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

/** Par etiqueta/valor de la ficha del comprobante. */
function Dato({ etiqueta, valor }) {
  if (!valor) return null;
  return (
    <div>
      <p className="text-xs text-faint">{etiqueta}</p>
      <p className="text-sm text-fg">{valor}</p>
    </div>
  );
}

/**
 * @param {object}   props
 * @param {object?}  props.fila       fila del listado de asistentes (null = cerrado)
 * @param {Function} props.onClose
 * @param {Function} props.onRevisado recibe { fila, comprobante, inscripcion }
 */
export default function ComprobanteRevisionModal({ fila, onClose, onRevisado }) {
  // El formulario arranca con el motivo que ya tuviera el comprobante. NO hace
  // falta re-sincronizarlo al cambiar de fila: los paneles montan este modal
  // con `key={id_comprobante}`, así que cada comprobante estrena su estado y el
  // motivo tecleado para una persona no reaparece en el de la siguiente.
  const [motivo, setMotivo] = useState(() => fila?.comprobante_motivo_rechazo || '');
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [enviando, setEnviando] = useState(null); // estado que se está guardando

  const estado = fila?.comprobante_estado || null;
  const tieneComprobante = Boolean(fila?.id_comprobante);

  const revisar = async (nuevoEstado) => {
    if (nuevoEstado === 'rechazado' && !motivo.trim()) {
      // El motivo viaja al inscrito, que es quien tiene que corregir el pago.
      setPidiendoMotivo(true);
      return;
    }
    setEnviando(nuevoEstado);
    try {
      const res = await fetch(`/api/eventos/comprobantes/${fila.id_comprobante}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: nuevoEstado,
          ...(nuevoEstado === 'rechazado' ? { motivo_rechazo: motivo.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el comprobante.');

      onRevisado?.({ fila, comprobante: data.comprobante, inscripcion: data.inscripcion });
      toast.success(
        nuevoEstado === 'aprobado'
          ? 'Pago validado: la inscripción queda confirmada.'
          : nuevoEstado === 'rechazado'
            ? 'Comprobante rechazado. El inscrito podrá subir otro.'
            : 'Comprobante devuelto a revisión.',
      );
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Modal
      isOpen={Boolean(fila)}
      onClose={onClose}
      title="Comprobante de pago"
      description={fila?.nombre_completo}
      size="lg"
      footer={
        tieneComprobante ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={Boolean(enviando)}>
              Cerrar
            </Button>
            {estado !== 'pendiente' && (
              <Button
                variant="secondary"
                onClick={() => revisar('pendiente')}
                loading={enviando === 'pendiente'}
                disabled={Boolean(enviando)}
              >
                Devolver a revisión
              </Button>
            )}
            {estado !== 'rechazado' && (
              <Button
                variant="danger"
                onClick={() => revisar('rechazado')}
                loading={enviando === 'rechazado'}
                disabled={Boolean(enviando)}
              >
                <X size={16} aria-hidden="true" /> Rechazar
              </Button>
            )}
            {estado !== 'aprobado' && (
              <Button
                onClick={() => revisar('aprobado')}
                loading={enviando === 'aprobado'}
                disabled={Boolean(enviando)}
              >
                <Check size={16} aria-hidden="true" /> Validar pago
              </Button>
            )}
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        )
      }
    >
      {!tieneComprobante ? (
        <EmptyState
          icon={ImageOff}
          title="Todavía no sube su comprobante"
          description="Cuando lo haga aparecerá aquí para validarlo. También puedes marcar el pago a mano desde la columna Pago."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={TONO_COMPROBANTE[estado] || 'neutral'}>
              {ETIQUETA_COMPROBANTE[estado] || estado}
            </Badge>
            {fila.comprobante_revisado_en && (
              <span className="text-xs text-faint">
                Revisado {formatearFechaHora(fila.comprobante_revisado_en)}
                {fila.comprobante_revisado_por ? ` por ${fila.comprobante_revisado_por}` : ''}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato etiqueta="Monto declarado" valor={formatearMonto(fila.comprobante_monto)} />
            <Dato etiqueta="Referencia" valor={fila.comprobante_referencia} />
            <Dato etiqueta="Subido" valor={formatearFechaHora(fila.comprobante_subido_en)} />
          </div>

          {/* `object-contain` y no `cover`: un comprobante recortado es un
              comprobante ilegible, y es justo lo que hay que leer. */}
          <div className="relative h-[45vh] w-full overflow-hidden rounded-lg border border-line bg-surface-2">
            <Image
              src={fila.comprobante_url}
              alt={`Comprobante de pago de ${fila.nombre_completo || 'la inscripción'}`}
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              className="object-contain"
            />
          </div>

          <a
            href={fila.comprobante_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-brand underline decoration-brand/40 underline-offset-4"
          >
            <ExternalLink size={14} aria-hidden="true" />
            Abrir la imagen a tamaño completo
          </a>

          {estado === 'rechazado' && fila.comprobante_motivo_rechazo && (
            <p className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
              Motivo del rechazo: {fila.comprobante_motivo_rechazo}
            </p>
          )}

          <Textarea
            label="Motivo del rechazo"
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (e.target.value.trim()) setPidiendoMotivo(false);
            }}
            rows={2}
            maxLength={500}
            placeholder="Ej. La transferencia es por un monto menor al costo."
            error={pidiendoMotivo ? 'Escribe el motivo antes de rechazar el comprobante.' : undefined}
            help="Sólo se guarda al rechazar. Es lo que verá quien pagó, así que tiene que decirle qué corregir."
          />
        </div>
      )}
    </Modal>
  );
}
