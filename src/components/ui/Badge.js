'use client';

/**
 * Etiqueta de estado. Sustituye los `rounded-full px-2 py-1 text-xs bg-…-500`
 * escritos a mano con colores elegidos al azar (morado, azul, verde) sin que
 * el color significara nada.
 *
 * El tono es semántico, no decorativo:
 *   neutral  — informativo, sin carga
 *   success  — algo está activo / confirmado / disponible
 *   warning  — requiere atención o está pendiente
 *   danger   — cancelado, cerrado, error
 *   info     — categoría o clasificación
 */
const TONES = {
  neutral: 'bg-surface-2 text-muted border-line',
  success: 'bg-brand-soft text-brand border-brand/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
  info: 'bg-info-soft text-info border-info/30',
};

export default function Badge({ tone = 'neutral', size = 'md', className = '', children, ...props }) {
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium ${sizeClass} ${TONES[tone] || TONES.neutral} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
