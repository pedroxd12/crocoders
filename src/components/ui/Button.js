'use client';

import { Loader2 } from 'lucide-react';

/**
 * Botón.
 *
 * El anterior desestructuraba una lista cerrada de props y descartaba el resto
 * en silencio, con tres consecuencias reales:
 *  - `loading` no existía: los formularios de inscripción no bloqueaban el
 *    botón y se podía enviar dos veces.
 *  - `variant="danger"` no existía: `variantStyles['danger']` era undefined y
 *    la acción destructiva quedaba sin fondo, un botón fantasma.
 *  - `title` / `aria-label` se perdían: los botones de solo icono del admin no
 *    tenían nombre accesible ni tooltip.
 */
const VARIANTS = {
  primary: 'bg-brand text-bg hover:bg-brand-strong focus-visible:ring-brand',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3 focus-visible:ring-line-strong',
  danger: 'bg-danger text-white hover:brightness-110 focus-visible:ring-danger',
  ghost: 'bg-transparent text-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-line-strong',
  text: 'bg-transparent text-muted hover:text-fg focus-visible:ring-line-strong',
};

const SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-9 w-9 text-sm',
};

const COLORS = {
  red: 'text-danger hover:text-danger',
  green: 'text-brand hover:text-brand',
  yellow: 'text-warning hover:text-warning',
  purple: 'text-accent hover:text-accent',
  blue: 'text-info hover:text-info',
};

export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  color,
  loading = false,
  className = '',
  disabled = false,
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap',
        'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        SIZES[size] || SIZES.md,
        VARIANTS[variant] || VARIANTS.primary,
        (variant === 'text' || variant === 'ghost') && color ? COLORS[color] || '' : '',
        isDisabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {loading && <Loader2 size={size === 'sm' ? 12 : 16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
