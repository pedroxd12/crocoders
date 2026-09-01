'use client';

import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { fieldClasses, fieldErrorClasses, labelClasses, helpClasses, errorTextClasses } from './field';

/**
 * Desplegable.
 *
 * El componente anterior no aceptaba `required` ni reenviaba props, así que los
 * formularios que pasaban `required` creían estar validando y no lo hacían: se
 * enviaba id_tipo_evento:'' y el servidor respondía un 400 genérico. Ahora
 * `required` llega al <select> y la opción vacía se marca `disabled`, que es lo
 * que hace que la validación nativa del navegador funcione de verdad.
 *
 * `options` acepta {value,label} o strings sueltos.
 */
export default function Select({
  label,
  name,
  id,
  value,
  onChange,
  options = [],
  placeholder = 'Selecciona una opción',
  required = false,
  error,
  help,
  className = '',
  wrapperClassName = '',
  ...props
}) {
  const autoId = useId();
  const selectId = id || name || autoId;

  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={selectId} className={labelClasses}>
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          name={name}
          value={value ?? ''}
          onChange={onChange}
          required={required}
          aria-invalid={error ? true : undefined}
          className={`${fieldClasses} appearance-none pr-9 ${error ? fieldErrorClasses : ''} ${className}`}
          {...props}
        >
          {/* `disabled` en la opción vacía: sin esto `required` no bloquea nada,
              porque el navegador considera "" un valor elegido válido. */}
          <option value="" disabled={required}>
            {placeholder}
          </option>
          {options.map((opt) => {
            const val = typeof opt === 'object' ? opt.value : opt;
            const text = typeof opt === 'object' ? opt.label : opt;
            return (
              <option key={val} value={val}>
                {text}
              </option>
            );
          })}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
        />
      </div>

      {error ? (
        <p className={errorTextClasses}>{error}</p>
      ) : help ? (
        <p className={helpClasses}>{help}</p>
      ) : null}
    </div>
  );
}
