'use client';

/**
 * Placeholder de carga.
 *
 * El panel mostraba una pantalla en blanco con la palabra "Cargando..." en cada
 * navegación, lo que hace que la app se sienta mucho más lenta de lo que es:
 * el usuario pierde por completo el contexto de la página. Un esqueleto con la
 * forma del contenido conserva el layout y se percibe casi instantáneo.
 */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} aria-hidden="true" />;
}

/** Esqueleto con forma de tabla, para las listas del panel. */
export function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface" aria-busy="true" aria-label="Cargando datos">
      <div className="flex gap-4 border-b border-line bg-surface-2 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-3 flex-1 ${c === 0 ? 'max-w-[40%]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Rejilla de tarjetas (dashboard, listados de eventos). */
export function CardsSkeleton({ count = 4, className = '' }) {
  return (
    <div className={className} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="mt-4 h-6 w-20" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
