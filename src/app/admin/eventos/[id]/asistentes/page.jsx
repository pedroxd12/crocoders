'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Download, QrCode, Receipt, Search, Shirt, UserPlus, UserRoundCheck, Users,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Table from '@/components/ui/Table';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import QRScannerModal from '@/components/QRScannerModal';
import RegistroManualModal from '@/components/admin/RegistroManualModal';
import ComprobanteRevisionModal from '@/components/eventos/ComprobanteRevisionModal';
import FichaEvento, { esPorEquipos } from '@/components/asistentes/FichaEvento';
import ResumenTallas from '@/components/asistentes/ResumenTallas';
import ResumenRetos from '@/components/asistentes/ResumenRetos';
import EquipoModal from '@/components/asistentes/EquipoModal';
import { useMarcasInscripcion, ModalConfirmarPago } from '@/components/asistentes/MarcasInscripcion';
import {
  colNombre, colCorreo, colTipo, colDesafio, colPerfil, colTalla, colPlayera,
  colAsistencia, colPago, colComprobante,
} from '@/components/asistentes/columnas';
import { fetcher } from '@/lib/fetcher';
import { formatearFechaDia } from '@/lib/fechas';
import {
  resumenAsistentes, filtrosDisponibles, aplicarFiltro, coincideBusqueda,
  filasCsvAsistentes, descargarCsv, nombreArchivoCsv,
} from '@/lib/asistentes-resumen';

/**
 * Lista de inscritos de un evento (panel de administración).
 *
 * La tabla se adapta a la configuración del evento: en concursos por equipos
 * cada fila es un equipo y se abre su roster; la talla y la playera sólo
 * aparecen si el evento las pide; el pago y el comprobante sólo si tiene
 * costo; el desafío sólo si el evento reparte por retos. Arriba, la ficha con
 * los datos generales y el resumen de tallas para pedir las playeras. Las
 * columnas y los cálculos son los MISMOS que ve el staff
 * (src/components/asistentes, src/lib/asistentes-resumen.js).
 */
export default function EventoAsistentes() {
  const { id } = useParams();
  const router = useRouter();

  // El evento se pide por su propia vía: un evento sin inscritos también
  // necesita cabecera y ficha.
  const { data: evento } = useSWR(id ? `/api/admin/eventos/${id}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const {
    data: asistentes,
    isLoading,
    mutate: mutarAsistentes,
  } = useSWR(id ? `/api/admin/eventos/${id}/asistentes` : null, fetcher, {
    revalidateOnFocus: false,
    onError: () => toast.error('Error al cargar la lista de asistentes'),
  });

  const lista = useMemo(() => (Array.isArray(asistentes) ? asistentes : []), [asistentes]);
  const resumen = useMemo(() => resumenAsistentes(lista), [lista]);
  const porEquipos = esPorEquipos(evento);
  // ¿Reparte por desafíos? Lo dice el evento; si aún no cargó, las propias
  // inscripciones (en cuanto una trae reto, la columna tiene sentido).
  const hayRetos = useMemo(
    () => Number(evento?.total_retos) > 0 || lista.some((a) => a.id_reto != null),
    [evento, lista],
  );

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('');
  const [registroAbierto, setRegistroAbierto] = useState(false);
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  // Fila cuyo comprobante se revisa / equipo que se está viendo (null = cerrado).
  const [comprobanteAbierto, setComprobanteAbierto] = useState(null);
  const [equipoAbierto, setEquipoAbierto] = useState(null);

  // Parche local de una fila: el servidor ya devolvió el resultado, no hace
  // falta volver a pedir la lista entera (la de un evento grande es cara).
  const parchear = useCallback(
    (idInscripcion, cambios) => {
      mutarAsistentes(
        (actual = []) => actual.map((a) => (a.id_inscripcion === idInscripcion ? { ...a, ...cambios } : a)),
        { revalidate: false },
      );
    },
    [mutarAsistentes],
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
    });
    descargarCsv(nombreArchivoCsv(evento?.nombre), cabeceras, filas);
  };

  const columnas = [
    colNombre({ onVerEquipo: setEquipoAbierto }),
    colCorreo,
    colTipo,
    ...(hayRetos ? [colDesafio] : []),
    colPerfil,
    ...(evento?.solicitar_talla ? [colTalla, colPlayera] : []),
    ...(evento?.tiene_costo
      ? [
          colComprobante({ puedeRevisar: true, onAbrir: setComprobanteAbierto }),
          colPago({ puedeMarcar: true, onCambiar: marcas.setPagoAConfirmar }),
        ]
      : []),
    colAsistencia({ puedeMarcar: true, onToggle: marcas.toggleAsistencia }),
  ];

  const pctLlegadas = resumen.personas ? Math.round((resumen.asistieron / resumen.personas) * 100) : 0;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a eventos
      </Button>

      <PageHeader
        title={evento?.nombre ?? 'Lista de inscritos'}
        description={evento ? `Inscritos y asistencia · ${formatearFechaDia(evento.fecha_inicio)}` : 'Inscritos y asistencia'}
        actions={
          <>
            <Button variant="secondary" onClick={exportar} disabled={lista.length === 0} title="Una fila por persona, con talla y estado">
              <Download size={16} aria-hidden="true" /> Exportar CSV
            </Button>
            <Button variant="secondary" onClick={() => setEscanerAbierto(true)}>
              <QrCode size={16} aria-hidden="true" /> Escanear QR
            </Button>
            <Button onClick={() => setRegistroAbierto(true)}>
              <UserPlus size={16} aria-hidden="true" /> Registrar manualmente
            </Button>
          </>
        }
      />

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
        {evento?.solicitar_talla && (
          <StatCard
            icon={Shirt}
            label="Playeras entregadas"
            value={`${resumen.playerasEntregadas}/${resumen.playerasTotal}`}
            tone="accent"
            hint={resumen.sinTalla ? `${resumen.sinTalla} sin talla registrada` : 'Todas las tallas registradas'}
          />
        )}
        {evento?.tiene_costo && (
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

      {evento?.solicitar_talla && <ResumenTallas resumen={resumen} className="mb-6" />}
      {hayRetos && <ResumenRetos resumen={resumen} porEquipos={porEquipos} className="mb-6" />}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
        <Input
          type="search"
          placeholder={porEquipos ? 'Buscar equipo, integrante, correo o desafío…' : 'Buscar por nombre, correo o número IEEE…'}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          icon={<Search size={16} />}
          aria-label="Buscar inscritos"
          wrapperClassName="w-full md:max-w-md"
        />
        <Select
          aria-label="Filtrar inscritos"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          options={filtros}
          placeholder="Todas las inscripciones"
          wrapperClassName="w-full md:w-64"
        />
        {lista.length > 0 && (
          <p className="text-xs text-muted tabular-nums md:ml-auto md:pb-2.5">
            {visibles.length} de {lista.length}
          </p>
        )}
      </div>

      <Table
        columns={columnas}
        data={visibles}
        getRowKey={(row) => row.id_inscripcion}
        loading={isLoading && !asistentes}
        emptyMessage={
          <EmptyState
            icon={Users}
            title={busqueda || filtro ? 'Sin coincidencias' : 'Nadie se ha inscrito todavía'}
            description={
              busqueda || filtro
                ? 'Prueba con otro nombre, correo o filtro.'
                : 'Cuando alguien se inscriba aparecerá aquí; también puedes registrarlo a mano.'
            }
          />
        }
      />

      {/* Registro manual con los MISMOS datos que el formulario público:
          buscador de usuarios existentes, ficha completa de invitado nuevo y,
          en concursos por equipos, el formulario de equipo. */}
      <RegistroManualModal
        isOpen={registroAbierto}
        onClose={() => setRegistroAbierto(false)}
        evento={evento}
        eventoId={id}
        asistentes={lista}
        onRegistered={() => mutarAsistentes()}
      />

      <ModalConfirmarPago marcas={marcas} />

      <EquipoModal
        fila={equipoAbierto}
        conTalla={Boolean(evento?.solicitar_talla)}
        onClose={() => setEquipoAbierto(null)}
      />

      {/* Revisión del comprobante: la misma pantalla que usa el panel de staff. */}
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
        // Sin esto, escanear por error el ticket de OTRO evento marcaba la
        // asistencia allí y respondía "Asistencia registrada".
        eventoId={id}
        onSuccess={() => mutarAsistentes()}
        // Los toggles de llegada/playera del panel del escáner también cambian
        // la lista (asistencia agregada del equipo, entrega de playeras).
        onUpdate={() => mutarAsistentes()}
      />
    </div>
  );
}
