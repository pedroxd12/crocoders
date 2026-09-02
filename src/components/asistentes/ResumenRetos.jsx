'use client';

import Card from '@/components/ui/Card';

/**
 * Cuántas inscripciones eligió cada desafío (eventos con retos, migración
 * 014). En un hackatón es lo que dice qué mesas se llenaron y cuáles no.
 */
export default function ResumenRetos({ resumen, porEquipos = false, className = '' }) {
  const retos = resumen?.porReto;
  if (!Array.isArray(retos) || retos.length === 0) return null;

  return (
    <Card className={className}>
      <h2 className="text-sm font-semibold text-fg">Inscripciones por desafío</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {retos.map((r) => (
          <li key={r.id_reto} className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs">
            <span className="font-medium text-fg">{r.titulo}</span>
            <span className="ml-2 text-muted tabular-nums">
              {r.inscripciones}{' '}
              {porEquipos
                ? r.inscripciones === 1 ? 'equipo' : 'equipos'
                : r.inscripciones === 1 ? 'inscrito' : 'inscritos'}
              {porEquipos && ` · ${r.personas} ${r.personas === 1 ? 'persona' : 'personas'}`}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
