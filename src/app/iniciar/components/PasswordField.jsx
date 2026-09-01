'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import {
  fieldClasses,
  fieldErrorClasses,
  labelClasses,
  helpClasses,
  errorTextClasses,
} from '@/components/ui/field';

/**
 * Campo de contraseña con interruptor de visibilidad y medidor de fuerza.
 *
 * No reutiliza <Input> porque el botón del ojo tiene que ir absolutamente
 * posicionado DENTRO del recuadro del campo, y <Input> no expone ese hueco.
 * A cambio importa `field.js`, que es donde viven de verdad el radio, el
 * padding y el anillo de foco del sistema: así el campo es idéntico al resto
 * del formulario en vez de ser un tercer estilo suelto.
 *
 * El medidor se repetía en dos vistas (registro y restablecimiento) con los
 * colores escritos a mano en `style`; ahora vive aquí una sola vez y usa los
 * tokens semánticos.
 */

/**
 * Fuerza de 0 a 4. Se exporta porque la validación de la página necesita el
 * mismo número que pinta la barra: si vivieran separados volverían a
 * divergir (el registro aceptaba fuerza 1 y el restablecimiento exigía 3).
 */
export function fuerzaContrasena(password) {
  if (!password) return 0;
  let fuerza = 0;
  if (password.length >= 8) fuerza += 1;
  if (/[A-Z]/.test(password)) fuerza += 1;
  if (/[0-9]/.test(password)) fuerza += 1;
  if (/[^A-Za-z0-9]/.test(password)) fuerza += 1;
  return fuerza;
}

/** Fuerza mínima aceptada al crear o restablecer una contraseña. */
export const FUERZA_MINIMA = 3;

const NIVELES = [
  { texto: 'Muy débil', barra: 'bg-danger', texto_color: 'text-danger' },
  { texto: 'Débil', barra: 'bg-danger', texto_color: 'text-danger' },
  { texto: 'Moderada', barra: 'bg-warning', texto_color: 'text-warning' },
  { texto: 'Fuerte', barra: 'bg-info', texto_color: 'text-info' },
  { texto: 'Muy fuerte', barra: 'bg-brand', texto_color: 'text-brand' },
];

export default function PasswordField({
  label,
  name,
  // `id` explícito para los casos en que dos campos comparten `name` dentro de
  // la misma vista; si no se pasa se deriva del name, como en ui/Input.
  id,
  value,
  onChange,
  placeholder = '••••••••',
  required = false,
  error,
  help,
  showStrength = false,
  autoComplete = 'new-password',
  className = '',
  ...props
}) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const fieldId = id || name || autoId;

  const fuerza = showStrength ? fuerzaContrasena(value) : 0;
  const nivel = NIVELES[fuerza] || NIVELES[0];

  // `className` se desestructura (no viaja dentro de ...props) para que una
  // clase del llamador se SUME al estilo base en lugar de sustituirlo, igual
  // que hace ui/Input. Se aplica después de ...props para que ninguna prop
  // suelta pueda pisar el radio, el padding ni el anillo de foco del sistema.
  const clasesCampo = `${fieldClasses} pl-10 pr-10 ${error ? fieldErrorClasses : ''} ${className}`;

  return (
    <div>
      {label && (
        <label htmlFor={fieldId} className={labelClasses}>
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
          <Lock size={16} />
        </span>
        <input
          id={fieldId}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined}
          {...props}
          className={clasesCampo}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-faint transition-colors hover:text-fg"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {showStrength && (
        <div className="mt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className={`h-full transition-all duration-300 ${value ? nivel.barra : ''}`}
              style={{ width: `${(fuerza / 4) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 flex items-center justify-between text-xs text-faint">
            <span>Seguridad</span>
            {value && <span className={nivel.texto_color}>{nivel.texto}</span>}
          </p>
        </div>
      )}

      {error ? (
        <p id={`${fieldId}-error`} className={errorTextClasses}>
          {error}
        </p>
      ) : help ? (
        <p id={`${fieldId}-help`} className={helpClasses}>
          {help}
        </p>
      ) : null}
    </div>
  );
}
