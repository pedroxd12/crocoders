'use client';

import Card from '@/components/ui/Card';
import { rangoEquipos } from '@/components/eventos/EventoBadges';
import { formatearFechaHora, formatearFechaLarga, formatearFechaMedia, formatearHora } from '@/lib/fechas';
import { esPorEquipos as esPorEquiposLib, unidadAforo, UNIDAD_AFORO } from '@/lib/aforo';

/**
 * Datos generales del evento tal como los necesita quien lo opera: qué tipo
 * es, si va por equipos y de cuántos, cuándo y dónde, cuánto aforo queda, si
 * cuesta, si se pide talla y cuántos desafíos tiene.
 *
 * La misma ficha se pinta en el panel de administración y en el de staff, así
 * que acepta los nombres de campo de los dos endpoints de detalle
 * (`tipo_nombre`/`tipo_evento`, `alcance_nombre`/`alcance`). Deliberadamente
 * sobria: etiqueta + valor, sin iconos ni chips de color.
 */
// Re-export por compatibilidad: la regla vive en src/lib/aforo.js.
export const esPorEquipos = esPorEquiposLib;

function textoModalidad(evento) {
  if (!evento?.id_concurso) return 'Individual';
  if (!esPorEquipos(evento)) return 'Concurso individual';
  const partes = [rangoEquipos(evento.min_integrantes_equipo, evento.max_integrantes_equipo)];
  const ocupaLugar = evento.asesor_participa ? 'participa' : 'no ocupa lugar';
  partes.push(evento.requiere_asesor ? `asesor obligatorio (${ocupaLugar})` : `asesor opcional (${ocupaLugar})`);
  return partes.join(' · ');
}

function textoFechas(evento) {
  const inicio = formatearFechaLarga(evento.fecha_inicio);
  if (!evento.fecha_fin || evento.fecha_fin === evento.fecha_inicio) return inicio;
  return `${formatearFechaMedia(evento.fecha_inicio)} – ${formatearFechaMedia(evento.fecha_fin)}`;
}

function Aforo({ evento, resumen }) {
  // Unidad del aforo: equipos en concursos por equipos, personas en el resto
  // (src/lib/aforo.js). El respaldo por `resumen` cuenta filas de inscripción,
  // que es exactamente esa unidad.
  const unidad = unidadAforo(evento);
  const u = UNIDAD_AFORO[unidad];
  const ocupados = Number(evento.lugares_ocupados ?? resumen?.inscripciones ?? 0);
  const cupos = evento.cupos != null ? Number(evento.cupos) : null;
  if (!cupos) {
    return (
      <span className="tabular-nums">
        {ocupados} {ocupados === 1 ? `${u.singular} ocupado` : `${u.plural} ocupados`} · sin límite
      </span>
    );
  }
  const pct = Math.min(100, Math.round((ocupados / cupos) * 100));
  return (
    <div>
      <span className="tabular-nums">
        {ocupados} de {cupos} {u.plural}
      </span>
      {evento.cupo_por_retos != null && (
        <span className="ml-1.5 text-xs text-faint">(según los desafíos)</span>
      )}
      <span className="ml-1.5 text-xs text-faint tabular-nums">({pct}%)</span>
      <div
        className="mt-1.5 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Ocupación del evento"
      >
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-warning' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function FichaEvento({ evento, resumen, className = '' }) {
  if (!evento) return null;

  const horario = evento.hora_inicio
    ? `${formatearHora(evento.hora_inicio)} – ${formatearHora(evento.hora_fin)}`
    : 'Por definir';
  const totalRetos = Number(evento.total_retos) || 0;

  const datos = [
    { etiqueta: 'Tipo', valor: evento.tipo_nombre || evento.tipo_evento || '—' },
    { etiqueta: 'Modalidad', valor: textoModalidad(evento) },
    { etiqueta: 'Alcance', valor: evento.alcance_nombre || evento.alcance || '—' },
    { etiqueta: 'Fecha', valor: textoFechas(evento) },
    { etiqueta: 'Horario', valor: horario },
    { etiqueta: 'Ubicación', valor: evento.ubicacion || 'Por definir' },
    { etiqueta: 'Aforo', valor: <Aforo evento={evento} resumen={resumen} /> },
    {
      etiqueta: 'Costo',
      valor: evento.tiene_costo ? `$${Number(evento.costo || 0).toFixed(2)} MXN` : 'Gratuito',
    },
    {
      etiqueta: 'Cierre de inscripciones',
      valor: evento.fecha_limite_registro
        ? formatearFechaHora(evento.fecha_limite_registro)
        : 'Hasta que inicie el evento',
    },
    {
      etiqueta: 'Playera',
      valor: evento.solicitar_talla ? 'Se pide talla al inscribirse' : 'No se pide talla',
    },
    ...(evento.asignar_mesas
      ? [{ etiqueta: 'Mesas', valor: 'Se asignan mesas o lugares' }]
      : []),
    ...(totalRetos > 0
      ? [{ etiqueta: 'Desafíos', valor: `${totalRetos} ${totalRetos === 1 ? 'desafío' : 'desafíos'}` }]
      : []),
  ];

  return (
    <Card className={className}>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {datos.map((d) => (
          <div key={d.etiqueta} className="min-w-0">
            <dt className="text-xs text-faint">{d.etiqueta}</dt>
            <dd className="mt-1 text-sm text-fg">{d.valor}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
