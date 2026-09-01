'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
  '3xl': 'max-w-7xl',
  fit: 'max-w-[90vw] sm:max-w-md',
  full: 'max-w-none w-full h-full',
};

/**
 * Diálogo modal.
 *
 * Correcciones sobre la versión anterior:
 *  - El velo usaba `bg-opacity-75`, una utilidad ELIMINADA en Tailwind v4, así
 *    que no generaba CSS y el fondo quedaba negro 100% opaco: el modal tapaba
 *    por completo la página. Ahora usa la sintaxis v4 `bg-black/70`.
 *  - No cerraba con Escape ni con clic fuera (el handler estaba comentado en el
 *    código), así que la única salida era acertar la X.
 *  - Bloqueaba el scroll de <body>, pero en /admin el body no scrollea nunca
 *    (el scroll vive en un div interno), así que el fondo seguía moviéndose.
 *    Al montarse en un portal sobre <body> y bloquear también el scroller
 *    marcado con [data-scroll-lock], eso queda resuelto.
 *  - No declaraba role/aria-modal ni movía el foco.
 *
 * `footer` permite fijar la barra de acciones fuera del área con scroll, para
 * que en formularios largos los botones Guardar/Cancelar estén siempre visibles.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'lg',
  className = '',
  bodyClassName = '',
  hideHeader = false,
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);

    // Congela tanto el body como el scroller propio del panel admin.
    const targets = [document.body, ...document.querySelectorAll('[data-scroll-lock]')];
    const previous = targets.map((el) => el.style.overflow);
    targets.forEach((el) => { el.style.overflow = 'hidden'; });

    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      targets.forEach((el, i) => { el.style.overflow = previous[i]; });
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const isFull = size === 'full';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={[
          'flex w-full flex-col bg-surface border border-line shadow-2xl outline-none',
          isFull ? 'h-full rounded-none' : 'rounded-2xl max-h-[90vh]',
          SIZES[size] || SIZES.lg,
          className,
        ].join(' ')}
      >
        {!hideHeader && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 shrink-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-fg truncate">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-fg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto ${hideHeader ? '' : 'px-5 py-4'} ${bodyClassName}`}>
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
