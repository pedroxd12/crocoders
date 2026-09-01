'use client';

/**
 * Métrica del dashboard.
 *
 * Vivía definida DENTRO de admin/page.js y pintaba el icono con el mismo color
 * que su fondo (`bg-blue-500` + `text-blue-500`), así que los cuatro iconos
 * eran invisibles: solo se veían cuatro cuadros de color sin significado.
 * Aquí el icono contrasta con su fondo y el color es un acento discreto, no el
 * elemento dominante de la tarjeta.
 */
const TONES = {
  brand: 'bg-brand-soft text-brand',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent/10 text-accent',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-2 text-muted',
};

export default function StatCard({ icon: Icon, label, value, hint, tone = 'neutral', className = '' }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[tone] || TONES.neutral}`}>
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-fg tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}
