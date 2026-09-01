'use client';

/**
 * Superficie de tarjeta. Existía escrita a mano ~200 veces con seis fondos
 * distintos (bg-gray-700, bg-gray-800, bg-gray-900/60, bg-white/5, bg-[#181a20]…)
 * para el mismo concepto. Aquí hay una sola.
 */
export function Card({ as: Tag = 'div', padded = true, className = '', children, ...props }) {
  return (
    <Tag
      className={`rounded-xl border border-line bg-surface ${padded ? 'p-5' : ''} ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export default Card;
