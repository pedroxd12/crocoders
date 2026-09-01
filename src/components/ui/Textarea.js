'use client';

import { useId } from 'react';
import { fieldClasses, fieldErrorClasses, labelClasses, helpClasses, errorTextClasses } from './field';

export default function Textarea({
  label,
  name,
  id,
  value,
  onChange,
  placeholder = '',
  required = false,
  rows = 3,
  error,
  help,
  className = '',
  wrapperClassName = '',
  ...props
}) {
  const autoId = useId();
  const textareaId = id || name || autoId;

  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={textareaId} className={labelClasses}>
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={`${fieldClasses} resize-y ${error ? fieldErrorClasses : ''} ${className}`}
        {...props}
      />
      {error ? (
        <p className={errorTextClasses}>{error}</p>
      ) : help ? (
        <p className={helpClasses}>{help}</p>
      ) : null}
    </div>
  );
}
