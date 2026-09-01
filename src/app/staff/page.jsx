'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { CalendarDays, ClipboardCheck, MapPin, ShieldCheck, Users } from 'lucide-react';

import { fetcher } from '@/lib/fetcher';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatearFechaMedia, formatearHora } from '@/lib/fechas';
import { estadoTemporal, esProximo, estaEnCurso } from './fechas';

export default function StaffDashboard() {
  const router = useRouter();
  const { data, error, isLoading } = useSWR('/api/staff/eventos', fetcher, {
    revalidateOnFocus: false,
  });

  const eventos = Array.isArray(data) ? data : [];
  const enCurso = eventos.filter(estaEnCurso);
  const proximos = eventos.filter(esProximo);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-16">
      <PageHeader
        title="Panel de staff"
        description="Eventos donde apoyas al equipo organizador y sus herramientas de asistencia."
      />

      {error ? (
        <Card className="border-danger/30 bg-danger-soft">
          <p className="text-sm text-danger">
            {error.status === 401
              ? 'Tu sesión caducó. Vuelve a iniciar sesión para continuar.'
              : 'No pudimos cargar tus eventos. Recarga la página.'}
          </p>
          {error.status === 401 && (
            <Button className="mt-3" size="sm" onClick={() => router.push('/iniciar')}>
              Iniciar sesión
            </Button>
          )}
        </Card>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard icon={CalendarDays} label="Eventos asignados" value={eventos.length} tone="info" />
            <StatCard icon={ClipboardCheck} label="En curso" value={enCurso.length} tone="brand" />
            <StatCard icon={ShieldCheck} label="Próximos" value={proximos.length} tone="accent" />
          </div>

          {enCurso.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold text-fg">Ocurriendo ahora</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {enCurso.map((evento) => (
                  <TarjetaEvento key={evento.id_evento} evento={evento} router={router} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-fg">Todos mis eventos</h2>

            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Card key={i}>
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-3 h-3 w-1/2" />
                    <Skeleton className="mt-2 h-3 w-1/3" />
                    <Skeleton className="mt-5 h-8 w-full rounded-lg" />
                  </Card>
                ))}
              </div>
            ) : eventos.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No estás asignado como staff a ningún evento"
                description="Cuando el equipo de organización te asigne a un evento, aparecerá aquí."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {eventos.map((evento) => (
                  <TarjetaEvento key={evento.id_evento} evento={evento} router={router} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TarjetaEvento({ evento, router }) {
  const estado = estadoTemporal(evento);
  const horario = evento.hora_inicio
    ? `${formatearHora(evento.hora_inicio)} – ${formatearHora(evento.hora_fin)}`
    : '';

  return (
    <Card padded={false} className="flex h-full flex-col overflow-hidden">
      {evento.imagen_url && (
        // Imagen decorativa del flyer: el nombre del evento ya está en el título.
        <div
          className="h-28 bg-cover bg-center"
          style={{ backgroundImage: `url(${evento.imagen_url})` }}
          role="presentation"
        />
      )}

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-fg">{evento.nombre}</h3>
          <Badge tone={estado.tone} className="shrink-0">{estado.label}</Badge>
        </div>

        <div className="mt-3 space-y-1.5 text-xs text-muted">
          <p className="flex items-center gap-1.5">
            <CalendarDays size={13} aria-hidden="true" />
            {formatearFechaMedia(evento.fecha_inicio)}
            {horario && <span className="text-faint">· {horario}</span>}
          </p>
          {evento.ubicacion && (
            <p className="flex items-center gap-1.5">
              <MapPin size={13} aria-hidden="true" />
              {evento.ubicacion}
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <ShieldCheck size={13} aria-hidden="true" />
            Mi rol: <span className="text-fg">{evento.mi_rol}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <Users size={13} aria-hidden="true" />
            <span className="tabular-nums text-fg">{evento.total_asistieron || 0}</span>
            de
            <span className="tabular-nums text-fg">{evento.total_inscritos || 0}</span>
            asistieron
          </p>
        </div>

        <div className="mt-auto pt-5">
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => router.push(`/staff/eventos/${evento.id_evento}`)}
          >
            Ver detalles
          </Button>
        </div>
      </div>
    </Card>
  );
}
