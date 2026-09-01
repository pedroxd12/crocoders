'use client';

import { useId } from 'react';

/**
 * Casilla de verificación con etiqueta asociada y texto de ayuda.
 *
 * Existe porque los formularios de programas la escribían a mano tres veces con
 * `text-gray-300` y sin `htmlFor`, así que el texto no era clicable y el lector
 * de pantalla anunciaba una casilla sin nombre.
 */
export default function Checkbox({ label, help, checked, onChange, id, disabled = false, ...props }) {
  const autoId = useId();
  const inputId = id || autoId;

  return (
    <div className="flex items-start gap-3">
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-surface-2 accent-brand disabled:opacity-50"
        aria-describedby={help ? `${inputId}-help` : undefined}
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className="block text-sm font-medium text-fg cursor-pointer">
          {label}
        </label>
        {help && <p id={`${inputId}-help`} className="mt-0.5 text-xs text-faint">{help}</p>}
      </div>
    </div>
  );
}
