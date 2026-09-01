'use client';

// Página índice del panel admin (/admin) = Dashboard.
// El shell (sidebar persistente, protección de ruta, header móvil) vive en
// admin/layout.jsx; aquí sólo va el contenido del dashboard.
import useSWR from 'swr';
import { Users, CalendarDays, DollarSign, Activity, Clock, UserCheck } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, CardsSkeleton } from '@/components/ui/Skeleton';

const MONEDA = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

// El color de la etiqueta significa algo: confirmada es un cierre en verde,
// pendiente requiere atención, cancelada es una baja.
const TONO_INSCRIPCION = {
  confirmada: 'success',
  pendiente: 'warning',
  cancelada: 'danger',
};

export default function AdminDashboardPage() {
  // SWR con caché: volver al dashboard desde otra sección lo pinta al instante
  // con los últimos datos y revalida en segundo plano, en vez de dejar la
  // pantalla vacía mientras se rehace la petición desde cero.
  const { data: stats, error, isLoading } = useSWR('/api/admin/stats', fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  const cargandoPrimeraVez = isLoading && !stats;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Resumen del club: miembros, eventos, recaudación e inscripciones."
      />

      {error && !stats ? (
        <Card>
          <EmptyState
            icon={Activity}
            title="No se pudieron cargar las estadísticas"
            description="Comprueba tu conexión y vuelve a intentarlo en unos segundos."
          />
        </Card>
      ) : null}

      {/* Métricas */}
      {cargandoPrimeraVez ? (
        <CardsSkeleton count={4} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" />
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Miembros activos"
            value={stats.activeMembers ?? 0}
            icon={Users}
            tone="brand"
          />
          {/* "Eventos realizados" contaba en realidad los publicados, futuros
              incluidos. La etiqueta dice ahora lo que el número mide. */}
          <StatCard
            label="Eventos publicados"
            value={stats.eventosPublicados ?? 0}
            icon={CalendarDays}
            tone="info"
          />
          <StatCard
            label="Total recaudado"
            value={MONEDA.format(Number(stats.totalRevenue) || 0)}
            icon={DollarSign}
            tone="accent"
            hint="Inscripciones con pago confirmado"
          />
          {/* Antes mostraba `recentInscriptions.length`, es decir el LIMIT 5 de
              la consulta: siempre decía "5". Ahora es un conteo real. */}
          <StatCard
            label="Inscripciones (30 días)"
            value={stats.inscripcionesUltimos30 ?? 0}
            icon={Activity}
            tone="warning"
          />
        </div>
      ) : null}

      {/* Paneles */}
      {cargandoPrimeraVez ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="space-y-4">
            <CardHeader
              title="Inscripciones recientes"
              description="Las últimas 5 altas registradas"
              actions={<Clock size={16} className="text-faint" aria-hidden="true" />}
            />
            {stats.recentInscriptions?.length > 0 ? (
              <ul className="space-y-2">
                {stats.recentInscriptions.map((ins, i) => (
                  <li
                    key={ins.id_inscripcion ?? i}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{ins.usuario || 'Sin nombre'}</p>
                      <p className="truncate text-xs text-muted">{ins.evento}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone={TONO_INSCRIPCION[ins.estado] || 'neutral'}>{ins.estado}</Badge>
                      <p className="mt-1 text-xs text-faint">
                        {new Date(ins.fecha_inscripcion).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Clock}
                title="Todavía no hay inscripciones"
                description="Aparecerán aquí en cuanto alguien se registre a un evento."
              />
            )}
          </Card>

          <Card className="space-y-4">
            <CardHeader
              title="Resumen de eventos"
              description="Registrados frente a asistencia real"
              actions={<UserCheck size={16} className="text-faint" aria-hidden="true" />}
            />
            {stats.eventStats?.length > 0 ? (
              <ul className="space-y-3">
                {stats.eventStats.map((evt) => {
                  const registrados = Number(evt.registrados) || 0;
                  const asistentes = Number(evt.asistentes) || 0;
                  const porcentaje = registrados > 0 ? Math.round((asistentes / registrados) * 100) : 0;
                  return (
                    <li key={evt.id_evento} className="rounded-lg bg-surface-2 p-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <h4 className="min-w-0 truncate text-sm font-medium text-fg">{evt.nombre}</h4>
                        <span className="shrink-0 text-xs text-faint">
                          {new Date(evt.fecha_inicio).toLocaleDateString('es-MX')}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        <span className="tabular-nums text-fg">{asistentes}</span> de{' '}
                        <span className="tabular-nums text-fg">{registrados}</span> registrados asistieron
                        {registrados > 0 ? ` (${porcentaje}%)` : ''}
                      </p>
                      <div
                        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
                        role="progressbar"
                        aria-valuenow={porcentaje}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Asistencia de ${evt.nombre}`}
                      >
                        <div className="h-full rounded-full bg-brand" style={{ width: `${porcentaje}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No hay eventos registrados"
                description="Crea un evento para empezar a medir asistencia."
              />
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
