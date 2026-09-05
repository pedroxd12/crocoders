'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Download, Eye, QrCode, Receipt, Search, Shirt, UserRoundCheck, Users, X,
} from 'lucide-react';

import { fetcher } from '@/lib/fetcher';
import { sanitizeHtml } from '@/lib/sanitize';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Table from '@/components/ui/Table';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import QRScannerModal from '@/components/QRScannerModal';
import ComprobanteRevisionModal from '@/components/eventos/ComprobanteRevisionModal';
import FichaEvento, { esPorEquipos } from '@/components/asistentes/FichaEvento';
import ResumenTallas from '@/components/asistentes/ResumenTallas';
import ResumenRetos from '@/components/asistentes/ResumenRetos';
import EquipoModal from '@/components/asistentes/EquipoModal';
import { useMarcasInscripcion, ModalConfirmarPago } from '@/components/asistentes/MarcasInscripcion';
import {
  colNombre, colCorreo, colTipo, colDesafio, colPerfil, colTalla, colPlayera, colMesa,
  colAsistencia, colPago, colComprobante,
} from '@/components/asistentes/columnas';
import {
  resumenAsistentes, filtrosDisponibles, aplicarFiltro, coincideBusqueda,
  filasCsvAsistentes, descargarCsv, nombreArchivoCsv,
} from '@/lib/asistentes-resumen';
import { permisosDeRol, nivelDeRol, ETIQUETA_NIVEL, TONO_NIVEL, DESCRIPCION_NIVEL } from '@/lib/roles-staff';
import { estadoTemporal } from '../../fechas';

/**
 * Detalle de un evento para el staff asignado.
 *
 * Muestra lo MISMO que el panel de administración (ficha del evento, resumen
 * de tallas, lista con roster de equipos, exportación) con las mismas piezas
 * (src/components/asistentes). Lo que cambia por rol es qué se puede tocar
 * (src/lib/roles-staff.js):
 *   - solo consulta: ve y exporta, sin botones de acción;
 *   - operación: además escanea el QR y valida comprobantes;
 *   - gestión: además marca asistencia y pago a mano desde la lista.
 * Antes todos veían los mismos botones y el servidor contestaba 403 al usarlos.
 */
export default function StaffEventoDetalle() {
  const { id } = useParams();
  const router = useRouter();

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('');
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const [comprobanteAbierto, setComprobanteAbierto] = useState(null);
  const [equipoAbierto, setEquipoAbierto] = useState(null);

  const {
    data: detalle,
    error: errorDetalle,
    isLoading: cargandoDetalle,
  } = useSWR(id ? `/api/staff/eventos/${id}` : null, fetcher, { revalidateOnFocus: false });

  const {
    data: asistentesData,
    isLoading: cargandoAsistentes,
    mutate: refrescarAsistentes,
  } = useSWR(id ? `/api/staff/eventos/${id}/asistentes` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const evento = detalle?.evento || null;
  const miRol = detalle?.mi_rol || null;
  const permisos = permisosDeRol(miRol);
  const nivel = nivelDeRol(miRol);

  const lista = useMemo(() => (Array.isArray(asistentesData) ? asistentesData : []), [asistentesData]);
  const resumen = useMemo(() => resumenAsistentes(lista), [lista]);
  const porEquipos = esPorEquipos(evento);
  const hayRetos = useMemo(
    () => Number(evento?.total_retos) > 0 || lista.some((a) => a.id_reto != null),
    [evento, lista],
  );

  const parchear = useCallback(
    (idInscripcion, cambios) => {
      refrescarAsistentes(
        (actual = []) => actual.map((a) => (a.id_inscripcion === idInscripcion ? { ...a, ...cambios } : a)),
        { revalidate: false },
      );
    },
    [refrescarAsistentes],
  );
  const marcas = useMarcasInscripcion({ parchear });

  const filtros = useMemo(() => filtrosDisponibles(evento), [evento]);
  const visibles = useMemo(
    () => aplicarFiltro(lista, filtro).filter((a) => coincideBusqueda(a, busqueda)),
    [lista, filtro, busqueda],
  );

  const exportar = () => {
    const { cabeceras, filas } = filasCsvAsistentes(lista, {
      conTalla: Boolean(evento?.solicitar_talla),
      conCosto: Boolean(evento?.tiene_costo),
      conRetos: hayRetos,
      conMesas: Boolean(evento?.asignar_mesas),
    });
    descargarCsv(nombreArchivoCsv(evento?.nombre), cabeceras, filas);
  };

  // 403: el usuario no es staff de este evento.
  if (errorDetalle?.status === 403) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-16">
        <EmptyState
          icon={X}
          title="No tienes permisos para este evento"
          description="Solo el staff asignado puede ver la lista de inscritos."
          action={<Button size="sm" onClick={() => router.push('/staff')}>Volver al panel</Button>}
        />
      </div>
    );
  }

  const estado = evento ? estadoTemporal(evento) : null;
  const pctLlegadas = resumen.personas ? Math.round((resumen.asistieron / resumen.personas) * 100) : 0;

  const columnas = [
    colNombre({ onVerEquipo: setEquipoAbierto }),
    colCorreo,
    colTipo,
    ...(hayRetos ? [colDesafio] : []),
    // Mesa: la ve todo el staff; la edita quien tiene rol de gestión.
    ...(evento?.asignar_mesas ? [colMesa({ puedeEditar: permisos.gestionar, onGuardar: marcas.guardarMesa })] : []),
    colPerfil,
    ...(evento?.solicitar_talla ? [colTalla, colPlayera] : []),
    ...(evento?.tiene_costo
      ? [
          colComprobante({ puedeRevisar: permisos.operar, onAbrir: setComprobanteAbierto }),
          colPago({ puedeMarcar: permisos.gestionar, onCambiar: marcas.setPagoAConfirmar }),
        ]
      : []),
    colAsistencia({ puedeMarcar: permisos.gestionar, onToggle: marcas.toggleAsistencia }),
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-16">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.push('/staff')}>
        <ArrowLeft size={15} aria-hidden="true" />
        Panel de staff
      </Button>

      {cargandoDetalle && !evento ? (
        <Card className="mb-6">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-6 h-24 w-full" />
        </Card>
      ) : evento ? (
        <>
          <PageHeader
            title={evento.nombre}
            description={evento.tipo_evento || undefined}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {estado && <Badge tone={estado.tone}>{estado.label}</Badge>}
                {miRol && <Badge tone="info">Mi rol: {miRol.rol}</Badge>}
                {miRol && <Badge tone={TONO_NIVEL[nivel]}>{ETIQUETA_NIVEL[nivel]}</Badge>}
              </div>
            }
          />

          {evento.imagen_url && (
            <div
              className="mb-6 h-44 rounded-xl border border-line bg-cover bg-center"
              style={{ backgroundImage: `url(${evento.imagen_url})` }}
              role="presentation"
            />
          )}

          {evento.descripcion && (
            <Card className="mb-6">
              <div
                className="prose-sm max-w-none text-sm leading-relaxed text-muted [&_a]:text-brand [&_strong]:text-fg"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(evento.descripcion) }}
              />
            </Card>
          )}

          <FichaEvento evento={evento} resumen={resumen} className="mb-6" />

          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label="Inscripciones"
              value={resumen.inscripciones}
              tone="info"
              hint={
                porEquipos
                  ? `${resumen.equipos} ${resumen.equipos === 1 ? 'equipo' : 'equipos'} · ${resumen.personas} personas${
                      resumen.asesores ? ` · ${resumen.asesores} ${resumen.asesores === 1 ? 'asesor' : 'asesores'}` : ''
                    }`
                  : `${resumen.porTipo.miembro} miembros · ${resumen.porTipo.invitado} invitados`
              }
            />
            <StatCard
              icon={UserRoundCheck}
              label="Llegaron"
              value={resumen.asistieron}
              tone="brand"
              hint={resumen.personas ? `${pctLlegadas}% de ${resumen.personas} personas` : undefined}
            />
            {evento.solicitar_talla && (
              <StatCard
                icon={Shirt}
                label="Playeras entregadas"
                value={`${resumen.playerasEntregadas}/${resumen.playerasTotal}`}
                tone="accent"
                hint={resumen.sinTalla ? `${resumen.sinTalla} sin talla registrada` : 'Todas las tallas registradas'}
              />
            )}
            {evento.tiene_costo && (
              <StatCard
                icon={Receipt}
                label="Pagos por validar"
                value={resumen.comprobantesPendientes}
                tone="warning"
                hint={
                  resumen.sinComprobante > 0
                    ? `${resumen.sinComprobante} ${resumen.sinComprobante === 1 ? 'inscripción' : 'inscripciones'} sin comprobante`
                    : 'Todos subieron su comprobante'
                }
              />
            )}
          </div>

          {evento.solicitar_talla && <ResumenTallas resumen={resumen} className="mb-6" />}
          {hayRetos && <ResumenRetos resumen={resumen} porEquipos={porEquipos} className="mb-6" />}
        </>
      ) : (
        <Card className="mb-6 border-danger/30 bg-danger-soft">
          <p className="text-sm text-danger">No pudimos cargar este evento.</p>
        </Card>
      )}

      {miRol && !permisos.operar && (
        // Rol de solo consulta: se dice de frente en vez de mostrar un botón
        // de escáner que iba a responder 403.
        <Card className="mb-6 border-line bg-surface-2">
          <p className="flex items-start gap-2 text-sm text-muted">
            <Eye size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Tu rol <span className="font-medium text-fg">{miRol.rol}</span> es de solo consulta: {DESCRIPCION_NIVEL.consulta}{' '}
              Las llegadas y las playeras las marca el staff de operación con el escáner QR.
            </span>
          </p>
        </Card>
      )}

      <Card className="mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          {permisos.operar && (
            <Button className="md:w-auto" onClick={() => setEscanerAbierto(true)}>
              <QrCode size={16} aria-hidden="true" />
              Escanear QR de asistencia
            </Button>
          )}
          <Input
            label="Buscar inscrito"
            wrapperClassName="flex-1"
            placeholder={porEquipos ? 'Equipo, integrante, correo, mesa o desafío' : 'Nombre, correo, mesa o número IEEE'}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            icon={<Search size={15} aria-hidden="true" />}
          />
          <Select
            label="Mostrar"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            options={filtros}
            placeholder="Todas las inscripciones"
            wrapperClassName="w-full md:w-60"
          />
          <Button variant="secondary" onClick={exportar} disabled={lista.length === 0} title="Una fila por persona, con talla y estado">
            <Download size={16} aria-hidden="true" />
            Exportar CSV
          </Button>
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-fg">Inscritos</h2>
        {lista.length > 0 && (
          <p className="text-xs text-muted tabular-nums">
            {visibles.length} de {lista.length}
          </p>
        )}
      </div>

      <Table
        loading={cargandoAsistentes && lista.length === 0}
        getRowKey={(row) => row.id_inscripcion}
        columns={columnas}
        data={visibles}
        emptyMessage={
          <EmptyState
            icon={Search}
            title={busqueda || filtro ? 'Ningún inscrito coincide' : 'Todavía no hay inscritos'}
            description={
              busqueda || filtro
                ? 'Prueba con otro nombre, correo o filtro.'
                : 'Cuando alguien se inscriba al evento aparecerá en esta lista.'
            }
          />
        }
      />

      <EquipoModal
        fila={equipoAbierto}
        conTalla={Boolean(evento?.solicitar_talla)}
        onClose={() => setEquipoAbierto(null)}
      />

      {permisos.gestionar && <ModalConfirmarPago marcas={marcas} />}

      {permisos.operar && (
        <>
          {/* Misma pantalla de validación que usa el panel de administración. */}
          <ComprobanteRevisionModal
            key={comprobanteAbierto?.id_comprobante ?? 'ninguno'}
            fila={comprobanteAbierto}
            onClose={() => setComprobanteAbierto(null)}
            onRevisado={({ fila, comprobante, inscripcion }) => {
              parchear(fila.id_inscripcion, {
                comprobante_estado: comprobante.estado,
                comprobante_motivo_rechazo: comprobante.motivo_rechazo,
                comprobante_revisado_en: comprobante.revisado_en,
                pago_completado: inscripcion.pago_completado,
                estado: inscripcion.estado,
              });
            }}
          />

          <QRScannerModal
            isOpen={escanerAbierto}
            onClose={() => setEscanerAbierto(false)}
            // El evento que se está viendo, para que el escáner rechace un
            // ticket de OTRO evento en vez de marcar asistencia allí.
            eventoId={id}
            onSuccess={(data) => {
              toast.success(`Asistencia registrada: ${data?.nombre || 'asistente'}`);
              refrescarAsistentes();
            }}
            // Marcar llegada/playera desde el roster del escáner también mueve
            // la lista (el agregado del equipo se recalcula en el servidor).
            onUpdate={() => refrescarAsistentes()}
          />
        </>
      )}
    </div>
  );
}
