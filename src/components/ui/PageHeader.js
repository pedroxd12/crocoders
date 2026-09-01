'use client';

/**
 * Cabecera de página del panel.
 *
 * Cada vista del admin se inventaba la suya: unas con <h2 text-2xl> y un icono
 * decorativo pegado al título, otras con <h1 text-3xl> y gradiente, otras sin
 * título. El icono junto al título no aportaba información (ya estás en la
 * sección, el sidebar la marca) y rompía la lectura, así que aquí no existe.
 */
export default function PageHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
