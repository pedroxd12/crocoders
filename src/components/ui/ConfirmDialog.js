'use client';

import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

/**
 * Confirmación de acciones destructivas.
 *
 * Sustituye a `window.confirm()`, que el panel usaba en 10 sitios: es un
 * cuadro del sistema operativo, en claro, que ignora el diseño de la app y —lo
 * importante— siempre dice lo mismo ("¿Estás seguro de eliminar este evento?")
 * sin nombrar QUÉ se borra ni advertir de lo que se lleva por delante.
 *
 * `consequences` es la lista de efectos colaterales reales (inscripciones,
 * evidencias, asistencias) para que la decisión sea informada.
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = '¿Confirmar acción?',
  message,
  consequences = [],
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      hideHeader
      bodyClassName="p-5"
      closeOnBackdrop={!loading}
    >
      <div className="flex gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning/10 text-warning'
          }`}
        >
          <AlertTriangle size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          {message && <p className="mt-1.5 text-sm text-muted">{message}</p>}

          {consequences.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
              {consequences.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className="text-faint">—</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-faint">Esta acción no se puede deshacer.</p>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
