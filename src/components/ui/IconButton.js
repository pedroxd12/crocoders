'use client';

/**
 * Botón de solo icono para las columnas de acciones.
 *
 * `label` es OBLIGATORIO y se usa a la vez como tooltip y como nombre
 * accesible. En la versión anterior estos botones pasaban `title` a un
 * componente que lo descartaba, así que un lector de pantalla anunciaba
 * "botón" cuatro veces seguidas y con el ratón no había forma de saber cuál
 * era cuál.
 */
const TONES = {
  neutral: 'text-muted hover:text-fg hover:bg-surface-2',
  brand: 'text-muted hover:text-brand hover:bg-brand-soft',
  info: 'text-muted hover:text-info hover:bg-info-soft',
  accent: 'text-muted hover:text-accent hover:bg-accent/10',
  danger: 'text-muted hover:text-danger hover:bg-danger-soft',
};

export default function IconButton({
  icon: Icon,
  label,
  tone = 'neutral',
  size = 16,
  className = '',
  ...props
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-line-strong',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        TONES[tone] || TONES.neutral,
        className,
      ].join(' ')}
      {...props}
    >
      <Icon size={size} aria-hidden="true" />
    </button>
  );
}
