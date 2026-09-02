'use client';

import { Check, Users, X } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { NIVELES_ESTUDIO } from '@/lib/registro-campos';
import { formatearFechaHora } from '@/lib/fechas';
import { esEquipo, personasDeFila } from '@/lib/asistentes-resumen';
import { TONO_COMPROBANTE, ETIQUETA_COMPROBANTE } from '@/lib/comprobante-estado';

/**
 * Columnas de la lista de inscritos, compartidas por el panel de
 * administración y el de staff para que los dos muestren lo mismo. Cada
 * pantalla compone su tabla con las que apliquen al evento (talla sólo si se
 * pide, pago sólo si tiene costo, desafío sólo si hay retos) y decide, según
 * el rol de quien mira, si las columnas de acción llevan botón o sólo lectura.
 */

const NIVEL_LABEL = Object.fromEntries(NIVELES_ESTUDIO.map((n) => [n.value, n.label]));

export const ETIQUETA_TIPO = { miembro: 'Miembro', invitado: 'Invitado', equipo: 'Equipo' };
export const TONO_TIPO = { miembro: 'info', invitado: 'neutral', equipo: 'warning' };

const tipoDe = (fila) => fila.tipo || (fila.tipo_usuario || '').toLowerCase();

/** Chip de talla: el dato que se LEE para tomar la playera. */
export function ChipTalla({ talla, titulo, tenue = false }) {
  return (
    <span
      title={titulo ? `${titulo}: ${talla || 'sin talla'}` : talla ? `Talla ${talla}` : 'Sin talla registrada'}
      className={`inline-flex min-w-[2rem] items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums ${
        talla
          ? tenue
            ? 'border-line text-muted'
            : 'border-line bg-surface-2 text-fg'
          : 'border-dashed border-line text-faint'
      }`}
    >
      {talla || '—'}
    </span>
  );
}

export function colNombre({ onVerEquipo } = {}) {
  return {
    header: 'Nombre',
    cellClassName: 'font-medium',
    render: (fila) =>
      esEquipo(fila) && onVerEquipo ? (
        <button
          type="button"
          onClick={() => onVerEquipo(fila)}
          className="group inline-flex items-center gap-1.5 text-left font-medium text-fg hover:text-brand"
          title="Ver integrantes y asesores del equipo"
        >
          <Users size={14} className="shrink-0 text-faint group-hover:text-brand" aria-hidden="true" />
          {fila.nombre_completo}
        </button>
      ) : (
        fila.nombre_completo
      ),
  };
}

export const colCorreo = { header: 'Correo', accessor: 'correo', cellClassName: 'text-muted' };

export const colTipo = {
  header: 'Tipo',
  render: (fila) => {
    const t = tipoDe(fila);
    return <Badge tone={TONO_TIPO[t] || 'neutral'}>{ETIQUETA_TIPO[t] || fila.tipo_usuario || t}</Badge>;
  },
};

export const colDesafio = {
  header: 'Desafío',
  render: (fila) =>
    fila.reto_titulo ? (
      <span className="text-xs font-medium text-fg">{fila.reto_titulo}</span>
    ) : (
      <span className="text-xs text-faint">Sin desafío</span>
    ),
};

/** Quién es: tamaño del equipo, o nivel/institución/edad de la persona. */
export const colPerfil = {
  header: 'Perfil',
  render: (fila) => {
    if (esEquipo(fila)) {
      const n = Number(fila.integrantes_equipo ?? fila.equipo?.integrantes?.length ?? 0);
      const a = Number(fila.equipo?.asesores?.length ?? 0);
      return (
        <span className="text-xs text-muted">
          {n} {n === 1 ? 'integrante' : 'integrantes'}
          {a > 0 && ` · ${a} ${a === 1 ? 'asesor' : 'asesores'}`}
        </span>
      );
    }
    if (tipoDe(fila) === 'miembro') {
      return (
        <span className="text-xs text-muted">
          Miembro del club{fila.numero_ieee ? ` · IEEE ${fila.numero_ieee}` : ''}
        </span>
      );
    }
    const partes = [NIVEL_LABEL[fila.nivel_estudios], fila.institucion, fila.edad ? `${fila.edad} años` : null].filter(Boolean);
    return <span className="text-xs text-muted">{partes.length ? partes.join(' · ') : '—'}</span>;
  },
};

/** Talla de la persona; en equipos, una por integrante (y las de asesores, más tenues). */
export const colTalla = {
  header: 'Talla',
  render: (fila) => {
    if (!esEquipo(fila)) return <ChipTalla talla={fila.talla_playera} />;
    const personas = personasDeFila(fila);
    const integrantes = personas.filter((p) => p.rol !== 'asesor');
    const asesores = personas.filter((p) => p.rol === 'asesor');
    return (
      <div className="flex flex-wrap items-center gap-1">
        {integrantes.map((p) => (
          <ChipTalla key={p.clave} talla={p.talla_playera} titulo={p.nombre} />
        ))}
        {asesores.length > 0 && (
          <span className="ml-1 text-[11px] text-faint">{asesores.length === 1 ? 'asesor:' : 'asesores:'}</span>
        )}
        {asesores.map((p) => (
          <ChipTalla key={p.clave} talla={p.talla_playera} titulo={p.nombre} tenue />
        ))}
      </div>
    );
  },
};

/** Entrega de playera. Se marca desde el escáner QR; aquí sólo se consulta. */
export const colPlayera = {
  header: 'Playera',
  render: (fila) =>
    esEquipo(fila) ? (
      <span className="text-xs text-muted tabular-nums">
        {fila.playeras_entregadas ?? 0}/{fila.personas_equipo ?? 0} entregadas
      </span>
    ) : fila.playera_entregada ? (
      <Badge tone="success">Entregada</Badge>
    ) : (
      <span className="text-xs text-faint">—</span>
    ),
};

export const colFechaInscripcion = {
  header: 'Se inscribió',
  render: (fila) => <span className="text-xs text-muted">{formatearFechaHora(fila.fecha_inscripcion)}</span>,
};

/**
 * Asistencia. En un equipo se lleva POR INTEGRANTE (migración 009) y se marca
 * desde el roster del escáner QR: la fila muestra el avance, nunca un botón
 * global que desincronizaría las marcas por persona. En individuales, botón
 * sólo si `puedeMarcar`.
 */
export function colAsistencia({ puedeMarcar = false, onToggle } = {}) {
  return {
    header: 'Asistencia',
    align: 'center',
    render: (fila) => {
      if (esEquipo(fila)) {
        const llegaron = Number(fila.integrantes_asistieron ?? 0);
        const total = Number(fila.integrantes_equipo ?? 0);
        return (
          <span
            className={`text-xs tabular-nums ${llegaron > 0 ? 'font-medium text-brand' : 'text-faint'}`}
            title="Integrantes con llegada registrada (se marca escaneando el QR del equipo)"
          >
            {llegaron}/{total}
          </span>
        );
      }
      if (!puedeMarcar) {
        return fila.asistio ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-brand">
            <Check size={14} aria-hidden="true" />
            Asistió
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-faint">
            <X size={14} aria-hidden="true" />
            Sin registrar
          </span>
        );
      }
      return (
        <button
          type="button"
          onClick={() => onToggle?.(fila)}
          title={fila.asistio ? 'Marcar como no asistió' : 'Marcar asistencia'}
          aria-label={fila.asistio ? 'Marcar como no asistió' : 'Marcar asistencia'}
          aria-pressed={Boolean(fila.asistio)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
            fila.asistio
              ? 'border-brand/30 bg-brand-soft text-brand'
              : 'border-line bg-surface-2 text-faint hover:text-fg'
          }`}
        >
          {fila.asistio ? <Check size={16} aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-current" />}
        </button>
      );
    },
  };
}

/** Estado de pago; botón para cambiarlo a mano sólo si `puedeMarcar`. */
export function colPago({ puedeMarcar = false, onCambiar } = {}) {
  return {
    header: 'Pago',
    render: (fila) => {
      if (!fila.requiere_pago) return <span className="text-xs text-faint">Gratuito</span>;
      const badge = (
        <Badge tone={fila.pago_completado ? 'success' : 'warning'}>{fila.pago_completado ? 'Pagado' : 'Pendiente'}</Badge>
      );
      return puedeMarcar ? (
        <button type="button" onClick={() => onCambiar?.(fila)} title="Cambiar el estado de pago">
          {badge}
        </button>
      ) : (
        badge
      );
    },
  };
}

/** Comprobante subido por el inscrito; se abre para revisarlo sólo si `puedeRevisar`. */
export function colComprobante({ puedeRevisar = false, onAbrir } = {}) {
  return {
    header: 'Comprobante',
    render: (fila) => {
      if (!fila.id_comprobante) return <span className="text-xs text-faint">Sin subir</span>;
      const badge = (
        <Badge tone={TONO_COMPROBANTE[fila.comprobante_estado] || 'neutral'}>
          {ETIQUETA_COMPROBANTE[fila.comprobante_estado] || fila.comprobante_estado}
        </Badge>
      );
      return puedeRevisar ? (
        <button type="button" onClick={() => onAbrir?.(fila)} title="Ver el comprobante y validar el pago">
          {badge}
        </button>
      ) : (
        badge
      );
    },
  };
}
