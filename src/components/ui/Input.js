'use client';

import { useId } from 'react';
import { fieldClasses, fieldErrorClasses, labelClasses, helpClasses, errorTextClasses } from './field';

/**
 * Campo de texto.
 *
 * Tres defectos del componente anterior que aquí quedan cerrados:
 *  - `className` se aplicaba al <div> contenedor y NUNCA al <input>, así que
 *    todas las llamadas del admin que pasaban clases de campo no hacían nada.
 *    Ahora `className` va al <input> y `wrapperClassName` al contenedor.
 *  - El <label> no tenía `htmlFor` ni el <input> un `id`: ningún campo tenía
 *    etiqueta asociada. Ahora se enlazan siempre.
 *  - `icon` se derramaba al DOM (React avisaba por consola) porque el
 *    componente no lo conocía. Ahora se renderiza de verdad.
 */
export default function Input({
  label,
  type = 'text',
  name,
  id,
  value,
  onChange,
  placeholder = '',
  required = false,
  error,
  help,
  icon,
  className = '',
  wrapperClassName = '',
  ...props
}) {
  const autoId = useId();
  const inputId = id || name || autoId;

  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={inputId} className={labelClasses}>
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}

      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : help ? `${inputId}-help` : undefined}
          className={`${fieldClasses} ${icon ? 'pl-10' : ''} ${error ? fieldErrorClasses : ''} ${className}`}
          {...props}
        />
      </div>

      {error ? (
        <p id={`${inputId}-error`} className={errorTextClasses}>{error}</p>
      ) : help ? (
        <p id={`${inputId}-help`} className={helpClasses}>{help}</p>
      ) : null}
    </div>
  );
}
