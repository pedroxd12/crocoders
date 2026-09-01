// Estilos compartidos por Input, Select y Textarea.
//
// Antes cada primitiva traía su propio radio, padding y anillo de foco
// (Input/Textarea: `rounded p-2 focus:ring-1`; Select: `rounded-lg px-4 py-2
// focus:ring-2`), así que tres campos apilados en el MISMO formulario no
// coincidían. Aquí viven las clases una sola vez.

export const fieldClasses =
  'w-full rounded-lg bg-surface-2 border border-line px-3 py-2.5 text-sm text-fg ' +
  'placeholder:text-faint transition-colors ' +
  'focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export const fieldErrorClasses = 'border-danger focus:border-danger focus:ring-danger/25';

export const labelClasses = 'block text-sm font-medium text-muted mb-1.5';

export const helpClasses = 'mt-1.5 text-xs text-faint';

export const errorTextClasses = 'mt-1.5 text-xs text-danger';
