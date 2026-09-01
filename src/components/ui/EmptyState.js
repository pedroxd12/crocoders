'use client';

/**
 * Estado vacío. Antes cada tabla pasaba su propio `emptyMessage`: unas un
 * string plano, otras JSX con su padding, y Table traía además un tercer estilo
 * por defecto. Tres presentaciones distintas para lo mismo.
 */
export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-2 text-faint">
          <Icon size={20} />
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
