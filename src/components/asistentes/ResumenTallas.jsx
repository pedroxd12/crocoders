'use client';

import Card from '@/components/ui/Card';
import { TALLAS_PLAYERA } from '@/lib/registro-campos';

/**
 * Cuántas playeras de cada talla hacen falta y cuántas se han entregado.
 *
 * Es lo que se necesita para hacer el pedido y para saber, el día del evento,
 * cuántas quedan por dar. Cuenta PERSONAS (participantes, integrantes de
 * equipo y asesores), no inscripciones; `resumen` viene de
 * `resumenAsistentes` (src/lib/asistentes-resumen.js).
 */
export default function ResumenTallas({ resumen, className = '' }) {
  if (!resumen) return null;

  const total = resumen.playerasTotal;
  const entregadas = resumen.playerasEntregadas;
  const pct = total ? Math.round((entregadas / total) * 100) : 0;

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-fg">Tallas de playera</h2>
        <p className="text-xs text-muted tabular-nums">
          {total} {total === 1 ? 'persona' : 'personas'} · {entregadas} {entregadas === 1 ? 'entregada' : 'entregadas'} ({pct}%)
        </p>
      </div>
      <p className="mt-1 text-xs text-faint">
        Cuenta a cada persona: participantes, integrantes de equipo y asesores.
      </p>

      <ul className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {TALLAS_PLAYERA.map((talla) => {
          const n = resumen.tallas?.[talla] || 0;
          return (
            <li
              key={talla}
              className={`rounded-lg border px-2 py-2 text-center ${
                n ? 'border-line bg-surface-2' : 'border-dashed border-line'
              }`}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{talla}</p>
              <p className={`mt-0.5 text-lg font-semibold tabular-nums ${n ? 'text-fg' : 'text-faint'}`}>{n}</p>
            </li>
          );
        })}
        <li
          className={`rounded-lg border px-2 py-2 text-center ${
            resumen.sinTalla ? 'border-warning/30 bg-warning/10' : 'border-dashed border-line'
          }`}
          title="Personas que no indicaron talla al inscribirse"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Sin talla</p>
          <p className={`mt-0.5 text-lg font-semibold tabular-nums ${resumen.sinTalla ? 'text-warning' : 'text-faint'}`}>
            {resumen.sinTalla}
          </p>
        </li>
      </ul>

      <div
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Playeras entregadas"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
}
