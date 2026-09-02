'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import Image from 'next/image';
import { toast } from 'react-toastify';
import {
  Plus, Pencil, Trash2, Users, Search, ShieldUser, CalendarX2, ImageOff, Target,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Table from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FlyerUploader from '@/components/FlyerUploader';
import { fetcher } from '@/lib/fetcher';
import { formatearFechaDia, formatearHora } from '@/lib/fechas';

const FORM_ID = 'formulario-evento';

// El servidor exige equipos de 2 o más (api/admin/eventos: "El mínimo de
// integrantes por equipo debe ser al menos 2"), así que el formulario arranca
// en 2. Antes proponía 1 y guardar con los valores por defecto siempre fallaba.
const MIN_INTEGRANTES = 2;

const ESTADO_TONO = {
  planificacion: 'neutral',
  publicado: 'success',
  en_curso: 'info',
  finalizado: 'neutral',
  cancelado: 'danger',
};

const ESTADO_ETIQUETA = {
  planificacion: 'Planificación',
  publicado: 'Publicado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

const FORM_VACIO = {
  nombre: '',
  descripcion_html: '',
  id_tipo_evento: '',
  id_alcance: '',
  fecha_inicio: '',
  fecha_fin: '',
  fecha_limite_registro: '',
  hora_inicio: '',
  hora_fin: '',
  ubicacion: '',
  cupos: 50,
  costo: 0,
  tiene_costo: false,
  instrucciones_pago: '',
  imagen_flyer_url: null,
  imagen_flyer_key: undefined,
  solicitar_talla: false,
  slug: '',
  es_concurso: false,
  modalidad: 'individual',
  max_integrantes_equipo: 3,
  min_integrantes_equipo: MIN_INTEGRANTES,
  id_plataforma: '',
  requiere_asesor: false,
  asesor_participa: false,
  max_asesores: 1,
  url_concurso: '',
};

/** Bloque del formulario. Agrupa campos afines para que el modal deje de ser
 *  una lista plana de 20 controles sin jerarquía. */
function Seccion({ title, description, children }) {
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-4">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** Casilla con etiqueta y explicación de lo que activa. */
function Casilla({ id, name, checked, onChange, label, help }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="h-4 w-4 accent-brand"
        />
        <label htmlFor={id} className="cursor-pointer select-none text-sm font-medium text-fg">
          {label}
        </label>
      </div>
      {help && <p className="ml-6 mt-1 text-xs text-faint">{help}</p>}
    </div>
  );
}

export default function EventosAdmin() {
  const router = useRouter();

  // SWR en lugar de fetch manual: al volver al panel la tabla se pinta desde
  // caché y sólo revalida en segundo plano, en vez de vaciarse en cada visita.
  const {
    data: eventos,
    error: eventosError,
    isLoading: eventosLoading,
    mutate: mutarEventos,
  } = useSWR('/api/admin/eventos', fetcher, { revalidateOnFocus: false });

  const { data: catalogosRaw } = useSWR('/api/admin/catalogos', fetcher, {
    revalidateOnFocus: false,
  });
  const catalogs = catalogosRaw ?? { tipos: [], alcances: [], plataformas: [] };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentEvento, setCurrentEvento] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState(FORM_VACIO);
  const [formErrors, setFormErrors] = useState({});
  // Marca si el admin tocó a mano la casilla de concurso. Mientras no lo haga,
  // el tipo de evento puede sugerirla; en cuanto la toca, manda su elección.
  const [esConcursoTocado, setEsConcursoTocado] = useState(false);

  const [eventoAEliminar, setEventoAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [confirmarQuitarConcurso, setConfirmarQuitarConcurso] = useState(false);

  const filteredEventos = useMemo(() => {
    const lista = Array.isArray(eventos) ? eventos : [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      (evento) =>
        evento.nombre?.toLowerCase().includes(q) ||
        evento.descripcion_html?.toLowerCase().includes(q),
    );
  }, [eventos, searchTerm]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;

    if (name === 'es_concurso') setEsConcursoTocado(true);

    setFormData((prev) => {
      const newData = { ...prev, [name]: val };

      // Sugerencia (no imposición): sólo al CREAR y mientras el admin no haya
      // tocado la casilla. Antes esto se ejecutaba siempre, así que cambiar el
      // tipo de un evento ya guardado desmarcaba la casilla sola y al guardar
      // se borraba la fila de `concurso` con toda su configuración.
      if (name === 'id_tipo_evento' && !currentEvento && !esConcursoTocado) {
        const tipo = catalogs.tipos.find((t) => t.id_tipo_evento === parseInt(val, 10));
        const nombreTipo = tipo?.nombre?.toLowerCase() ?? '';
        newData.es_concurso = nombreTipo.includes('concurso') || nombreTipo.includes('hackathon');
      }

      return newData;
    });
  };

  /**
   * Validación cruzada en el cliente. Antes no existía ninguna: las
   * incoherencias de fecha/hora sólo las detectaba un CHECK de la base de datos
   * tras el viaje de ida y vuelta, y con un toast que no señalaba el campo. La
   * fecha límite posterior al evento no la detectaba nadie.
   */
  const validarFormulario = () => {
    const errores = {};
    const { fecha_inicio, fecha_fin, hora_inicio, hora_fin, fecha_limite_registro } = formData;

    if (fecha_fin && fecha_inicio && fecha_fin < fecha_inicio) {
      errores.fecha_fin = 'La fecha de fin no puede ser anterior a la de inicio.';
    }

    const mismoDia = !fecha_fin || fecha_fin === fecha_inicio;
    if (mismoDia && hora_inicio && hora_fin && hora_fin <= hora_inicio) {
      errores.hora_fin = 'En un evento de un solo día, la hora de fin debe ser posterior a la de inicio.';
    }

    if (fecha_limite_registro && fecha_inicio) {
      const limite = new Date(fecha_limite_registro);
      const inicio = new Date(`${fecha_inicio}T${hora_inicio || '00:00'}`);
      if (limite > inicio) {
        errores.fecha_limite_registro =
          'El registro debe cerrar antes de que empiece el evento.';
      }
    }

    if (Number(formData.cupos) < 1) {
      errores.cupos = 'Debe haber al menos 1 cupo.';
    }

    if (formData.tiene_costo && Number(formData.costo) <= 0) {
      errores.costo = 'Indica un costo mayor que cero o desmarca "Tiene costo".';
    }

    if (formData.es_concurso && formData.modalidad === 'equipos') {
      const min = Number(formData.min_integrantes_equipo);
      const max = Number(formData.max_integrantes_equipo);
      if (!Number.isFinite(min) || min < MIN_INTEGRANTES) {
        errores.min_integrantes_equipo = `Un equipo necesita al menos ${MIN_INTEGRANTES} integrantes.`;
      } else if (max < min) {
        errores.max_integrantes_equipo = 'El máximo no puede ser menor que el mínimo.';
      }
    }

    setFormErrors(errores);
    return Object.keys(errores).length === 0;
  };

  const guardarEvento = async () => {
    setIsSubmitting(true);
    try {
      const payload = { ...formData };
      payload.cupos = Number(payload.cupos) || 0;
      payload.costo = Number(payload.costo) || 0;
      payload.id_tipo_evento = parseInt(payload.id_tipo_evento, 10);
      payload.id_alcance = parseInt(payload.id_alcance, 10);
      if (payload.id_plataforma) payload.id_plataforma = parseInt(payload.id_plataforma, 10);

      const method = currentEvento ? 'PUT' : 'POST';
      const url = currentEvento
        ? `/api/admin/eventos/${currentEvento.id_evento}`
        : '/api/admin/eventos';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al guardar el evento');
      }

      toast.success(`Evento ${currentEvento ? 'actualizado' : 'creado'} correctamente`);
      setIsModalOpen(false);
      setConfirmarQuitarConcurso(false);
      // `mutate()` revalida sin vaciar la tabla: los datos ya cargados siguen
      // en pantalla mientras llega la respuesta.
      mutarEventos();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validarFormulario()) {
      toast.error('Revisa los campos marcados en rojo.');
      return;
    }
    // Desmarcar la casilla en un evento que YA tiene concurso borra su fila en
    // la tabla `concurso`. Eso no puede pasar en silencio.
    if (currentEvento?.id_concurso && !formData.es_concurso) {
      setConfirmarQuitarConcurso(true);
      return;
    }
    guardarEvento();
  };

  const confirmarEliminacion = async () => {
    if (!eventoAEliminar) return;
    setEliminando(true);
    try {
      const res = await fetch(`/api/admin/eventos/${eventoAEliminar.id_evento}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al eliminar');
      }
      toast.success('Evento eliminado correctamente');
      setEventoAEliminar(null);
      mutarEventos();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEliminando(false);
    }
  };

  const openEditModal = (evento) => {
    setCurrentEvento(evento);
    setFormErrors({});
    // Al editar nunca se autodetecta: la configuración guardada manda.
    setEsConcursoTocado(true);

    setFormData({
      nombre: evento.nombre ?? '',
      descripcion_html: evento.descripcion_html || '',
      id_tipo_evento: evento.id_tipo_evento ?? '',
      id_alcance: evento.id_alcance ?? '',
      fecha_inicio: evento.fecha_inicio ? String(evento.fecha_inicio).slice(0, 10) : '',
      fecha_fin: evento.fecha_fin ? String(evento.fecha_fin).slice(0, 10) : '',
      fecha_limite_registro: evento.fecha_limite_registro || '',
      // Postgres devuelve TIME como "09:00:00"; <input type="time"> sin `step`
      // sólo admite "HH:MM", así que se recorta o el campo aparece vacío.
      hora_inicio: evento.hora_inicio ? String(evento.hora_inicio).slice(0, 5) : '',
      hora_fin: evento.hora_fin ? String(evento.hora_fin).slice(0, 5) : '',
      ubicacion: evento.ubicacion || '',
      cupos: evento.cupos ?? 0,
      costo: evento.costo ?? 0,
      tiene_costo: Boolean(evento.tiene_costo),
      instrucciones_pago: evento.instrucciones_pago || '',
      imagen_flyer_url: evento.imagen_flyer_url ?? null,
      // Se lee `imagen_flyer_key` (el nombre real de la columna); antes se leía
      // `imagen_key`, que la API nunca ha devuelto. `undefined` a propósito: si
      // el admin no toca la imagen, JSON.stringify elimina la clave del payload
      // y el PUT conserva la que ya hay en la base. Sólo se envía cuando el
      // admin sube otro flyer o lo quita.
      imagen_flyer_key: evento.imagen_flyer_key ?? undefined,
      solicitar_talla: Boolean(evento.solicitar_talla),
      slug: evento.slug || '',
      es_concurso: evento.id_concurso != null,
      modalidad: evento.modalidad || 'individual',
      max_integrantes_equipo: evento.max_integrantes_equipo || 3,
      min_integrantes_equipo: evento.min_integrantes_equipo || MIN_INTEGRANTES,
      id_plataforma: evento.id_plataforma || '',
      requiere_asesor: evento.requiere_asesor || false,
      asesor_participa: Boolean(evento.asesor_participa),
      max_asesores: evento.max_asesores || 1,
      url_concurso: evento.url_concurso || '',
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setCurrentEvento(null);
    setFormErrors({});
    setEsConcursoTocado(false);
    setFormData({
      ...FORM_VACIO,
      id_tipo_evento: catalogs.tipos[0]?.id_tipo_evento || '',
      id_alcance: catalogs.alcances[0]?.id_alcance || '',
    });
    setIsModalOpen(true);
  };

  const columnas = [
    {
      header: 'Evento',
      render: (evento) => (
        <div className="flex items-center gap-3">
          {evento.imagen_flyer_url ? (
            <Image
              src={evento.imagen_flyer_url}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-faint">
              <ImageOff size={16} aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{evento.nombre}</div>
            <div className="text-xs text-muted">
              {evento.tipo_nombre}
              {evento.total_retos > 0 && ` · ${evento.total_retos} desafío${evento.total_retos === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Fecha',
      render: (evento) => (
        <div>
          <div>{formatearFechaDia(evento.fecha_inicio)}</div>
          <div className="text-xs text-muted">
            {formatearHora(evento.hora_inicio)} – {formatearHora(evento.hora_fin)}
          </div>
        </div>
      ),
    },
    {
      header: 'Estado',
      render: (evento) => (
        <Badge tone={ESTADO_TONO[evento.estado] || 'neutral'}>
          {ESTADO_ETIQUETA[evento.estado] || evento.estado || '—'}
        </Badge>
      ),
    },
    { header: 'Alcance', accessor: 'alcance_nombre' },
    {
      header: 'Cupos',
      align: 'center',
      render: (evento) => (
        <span className="tabular-nums">
          {evento.cupos_disponibles ?? '∞'} / {evento.cupos ?? '∞'}
        </span>
      ),
    },
    {
      header: 'Inscritos',
      align: 'center',
      render: (evento) => <span className="tabular-nums font-medium">{evento.total_inscritos}</span>,
    },
    {
      header: 'Acciones',
      align: 'right',
      render: (evento) => (
        <div className="flex justify-end gap-1">
          <IconButton
            icon={Target}
            label="Desafíos del evento"
            tone="neutral"
            onClick={() => router.push(`/admin/eventos/${evento.id_evento}/retos`)}
          />
          <IconButton
            icon={ShieldUser}
            label="Gestionar staff"
            tone="accent"
            onClick={() => router.push(`/admin/eventos/${evento.id_evento}/staff`)}
          />
          <IconButton
            icon={Users}
            label="Ver asistentes"
            tone="info"
            onClick={() => router.push(`/admin/eventos/${evento.id_evento}/asistentes`)}
          />
          <IconButton icon={Pencil} label="Editar evento" tone="brand" onClick={() => openEditModal(evento)} />
          <IconButton
            icon={Trash2}
            label="Eliminar evento"
            tone="danger"
            onClick={() => setEventoAEliminar(evento)}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Gestión de eventos"
        description="Crea eventos, controla su aforo y revisa quién se inscribe."
        actions={
          <>
            <Input
              type="search"
              placeholder="Buscar eventos…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search size={16} />}
              aria-label="Buscar eventos"
              wrapperClassName="w-full sm:w-64"
            />
            <Button onClick={openCreateModal}>
              <Plus size={16} aria-hidden="true" /> Nuevo evento
            </Button>
          </>
        }
      />

      {eventosError && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          No se pudieron cargar los eventos.{' '}
          <button type="button" onClick={() => mutarEventos()} className="underline">
            Reintentar
          </button>
        </p>
      )}

      <Table
        columns={columnas}
        data={filteredEventos}
        getRowKey={(evento) => evento.id_evento}
        // Sólo la PRIMERA carga muestra esqueleto. Al revalidar tras una
        // mutación los datos siguen en pantalla en lugar de desaparecer.
        loading={eventosLoading && !eventos}
        emptyMessage={
          searchTerm ? (
            <EmptyState
              icon={Search}
              title="Sin coincidencias"
              description={`Ningún evento coincide con “${searchTerm}”.`}
              action={
                <Button variant="secondary" onClick={() => setSearchTerm('')}>
                  Limpiar búsqueda
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={CalendarX2}
              title="Todavía no hay eventos"
              description="Crea el primero para que aparezca en la web y admita inscripciones."
              action={
                <Button onClick={openCreateModal}>
                  <Plus size={16} aria-hidden="true" /> Nuevo evento
                </Button>
              }
            />
          )
        }
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentEvento ? 'Editar evento' : 'Crear nuevo evento'}
        description={
          currentEvento
            ? 'Los cambios se reflejan de inmediato en la ficha pública del evento.'
            : 'Rellena los datos mínimos; el resto puede completarse después.'
        }
        size="xl"
        // Barra de acciones FIJA: antes los botones vivían al final del scroll
        // del formulario y había que bajar a ciegas para guardar.
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" form={FORM_ID} loading={isSubmitting}>
              {currentEvento ? 'Guardar cambios' : 'Crear evento'}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5" noValidate>
          <Seccion title="Identidad" description="Cómo se anuncia el evento y dónde ocurre.">
            <Input
              label="Nombre del evento"
              name="nombre"
              value={formData.nombre}
              onChange={handleInputChange}
              required
              placeholder="Ej. Maratón de Programación 2026"
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label="Tipo de evento"
                name="id_tipo_evento"
                value={formData.id_tipo_evento}
                onChange={handleInputChange}
                required
                placeholder="Seleccionar tipo"
                options={catalogs.tipos.map((t) => ({ value: t.id_tipo_evento, label: t.nombre }))}
              />
              <Select
                label="Alcance"
                name="id_alcance"
                value={formData.id_alcance}
                onChange={handleInputChange}
                required
                placeholder="Seleccionar alcance"
                help="Determina a qué comunidad se anuncia."
                options={catalogs.alcances.map((a) => ({ value: a.id_alcance, label: a.nombre }))}
              />
            </div>
            <Input
              label="Ubicación"
              name="ubicacion"
              value={formData.ubicacion}
              onChange={handleInputChange}
              placeholder="Aula, laboratorio o enlace de la sesión"
            />
            <Input
              label="Identificador de página propia"
              name="slug"
              value={formData.slug}
              onChange={handleInputChange}
              placeholder="hackaitlac"
              help="Sólo para eventos con landing propia. Escribe «hackaitlac» aquí y /hackaitlac publicará los desafíos y el registro de ESTE evento. Déjalo vacío en el resto."
            />
          </Seccion>

          <Seccion title="Fechas y horario" description="Cuándo empieza y cuándo termina.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Fecha de inicio"
                type="date"
                name="fecha_inicio"
                value={formData.fecha_inicio}
                onChange={handleInputChange}
                required
              />
              <Input
                label="Fecha de fin"
                type="date"
                name="fecha_fin"
                value={formData.fecha_fin}
                onChange={handleInputChange}
                min={formData.fecha_inicio || undefined}
                error={formErrors.fecha_fin}
                help="Déjala igual a la de inicio si dura un solo día."
              />
              <Input
                label="Hora de inicio"
                type="time"
                name="hora_inicio"
                value={formData.hora_inicio}
                onChange={handleInputChange}
                required
              />
              <Input
                label="Hora de fin"
                type="time"
                name="hora_fin"
                value={formData.hora_fin}
                onChange={handleInputChange}
                required
                error={formErrors.hora_fin}
              />
            </div>
          </Seccion>

          <Seccion title="Aforo y acceso" description="Cuánta gente cabe, hasta cuándo se acepta y a qué precio.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Cupos"
                type="number"
                name="cupos"
                min="1"
                value={formData.cupos}
                onChange={handleInputChange}
                required
                error={formErrors.cupos}
              />
              <Input
                label="Fecha límite de registro"
                type="datetime-local"
                name="fecha_limite_registro"
                value={formData.fecha_limite_registro}
                onChange={handleInputChange}
                max={
                  formData.fecha_inicio
                    ? `${formData.fecha_inicio}T${formData.hora_inicio || '23:59'}`
                    : undefined
                }
                error={formErrors.fecha_limite_registro}
                help="Si se deja vacío, se permitirán inscripciones hasta 1 hora antes del inicio del evento."
              />
            </div>

            <Casilla
              id="solicitar_talla"
              name="solicitar_talla"
              checked={formData.solicitar_talla}
              onChange={handleInputChange}
              label="Pedir talla de playera al inscribirse"
              help="Actívalo si el evento entrega playera o kit. El formulario público pedirá la talla a miembros, invitados y a cada integrante de equipo."
            />

            <Casilla
              id="tiene_costo"
              name="tiene_costo"
              checked={formData.tiene_costo}
              onChange={handleInputChange}
              label="El evento tiene costo de acceso"
              help="El cobro se hace fuera de la plataforma. Al activarlo, quien se inscriba deberá subir una imagen de su comprobante y el staff la validará."
            />
            {formData.tiene_costo && (
              <>
                <Input
                  label="Costo (MXN)"
                  type="number"
                  name="costo"
                  min="0"
                  step="0.01"
                  value={formData.costo}
                  onChange={handleInputChange}
                  error={formErrors.costo}
                  wrapperClassName="max-w-xs"
                />
                <Textarea
                  label="Instrucciones de pago"
                  name="instrucciones_pago"
                  rows={4}
                  value={formData.instrucciones_pago}
                  onChange={handleInputChange}
                  placeholder={'Ej. Transferencia a BBVA 0123456789 a nombre de… o pago en efectivo en el cubículo K-12.'}
                  help="Se muestran en la ficha del evento y en el paso donde se pide el comprobante. Al inscribirse, la persona sube una imagen del pago y el staff la valida."
                />
              </>
            )}
          </Seccion>

          <Seccion title="Concurso" description="Sólo para competencias con equipos, plataforma o asesor.">
            <Casilla
              id="es_concurso"
              name="es_concurso"
              checked={formData.es_concurso}
              onChange={handleInputChange}
              label="Habilitar funciones de concurso"
              help="Activa el registro por equipos, la plataforma u online judge y el asesor obligatorio."
            />

            {formData.es_concurso && (
              <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Select
                    label="Modalidad de participación"
                    name="modalidad"
                    value={formData.modalidad}
                    onChange={handleInputChange}
                    required
                    placeholder="Seleccionar modalidad"
                    options={[
                      { value: 'individual', label: 'Individual' },
                      { value: 'equipos', label: 'Por equipos' },
                    ]}
                  />
                  <Select
                    label="Plataforma / online judge"
                    name="id_plataforma"
                    value={formData.id_plataforma}
                    onChange={handleInputChange}
                    placeholder="Ninguna u otra"
                    options={catalogs.plataformas.map((p) => ({
                      value: p.id_plataforma,
                      label: p.nombre,
                    }))}
                  />
                </div>

                {formData.modalidad === 'equipos' && (
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Mín. integrantes"
                      type="number"
                      name="min_integrantes_equipo"
                      min={MIN_INTEGRANTES}
                      value={formData.min_integrantes_equipo}
                      onChange={handleInputChange}
                      error={formErrors.min_integrantes_equipo}
                    />
                    <Input
                      label="Máx. integrantes"
                      type="number"
                      name="max_integrantes_equipo"
                      min={Math.max(MIN_INTEGRANTES, Number(formData.min_integrantes_equipo) || MIN_INTEGRANTES)}
                      value={formData.max_integrantes_equipo}
                      onChange={handleInputChange}
                      error={formErrors.max_integrantes_equipo}
                    />
                  </div>
                )}

                <Casilla
                  id="requiere_asesor"
                  name="requiere_asesor"
                  checked={formData.requiere_asesor}
                  onChange={handleInputChange}
                  label="Requerir asesor"
                  help="El formulario de inscripción pedirá los datos del asesor como obligatorios."
                />

                <Casilla
                  id="asesor_participa"
                  name="asesor_participa"
                  checked={formData.asesor_participa}
                  onChange={handleInputChange}
                  label="El asesor participa como integrante"
                  help="Si NO participa, el evento se anuncia como «equipos de N integrantes + asesor» y el asesor no ocupa lugar del equipo."
                />

                <Input
                  label="Máx. asesores por equipo"
                  type="number"
                  name="max_asesores"
                  min="1"
                  max="5"
                  value={formData.max_asesores}
                  onChange={handleInputChange}
                  help="El formulario de equipo permitirá «Agregar asesor» hasta este tope."
                  wrapperClassName="max-w-xs"
                />

                <Input
                  label="URL del concurso (externo)"
                  name="url_concurso"
                  value={formData.url_concurso}
                  onChange={handleInputChange}
                  placeholder="https://…"
                />
              </div>
            )}
          </Seccion>

          <Seccion title="Contenido" description="Lo que verá quien abra la ficha del evento.">
            <Textarea
              label="Descripción"
              name="descripcion_html"
              value={formData.descripcion_html}
              onChange={handleInputChange}
              rows={5}
              help="Admite HTML básico: párrafos, negritas, listas y enlaces."
            />
            <div>
              <p className="mb-1.5 block text-sm font-medium text-muted">Flyer del evento</p>
              <FlyerUploader
                url={formData.imagen_flyer_url}
                onChange={({ url, key }) =>
                  setFormData((prev) => ({ ...prev, imagen_flyer_url: url, imagen_flyer_key: key }))
                }
                onError={(mensaje) => toast.error(mensaje)}
              />
            </div>
          </Seccion>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(eventoAEliminar)}
        onClose={() => setEventoAEliminar(null)}
        onConfirm={confirmarEliminacion}
        loading={eliminando}
        title={`Eliminar “${eventoAEliminar?.nombre ?? ''}”`}
        // El DELETE del servidor es una BAJA LÓGICA (deleted_at + estado
        // 'cancelado' + listable = FALSE), no un borrado físico. El texto tiene
        // que decir eso y no prometer una destrucción que no ocurre: el
        // historial se conserva, lo que se pierde es el acceso desde el panel.
        message="Se da de baja el evento: se marca como cancelado y desaparece de la web y del panel. No hay forma de recuperarlo desde aquí."
        consequences={[
          `Se cierran las inscripciones; las ${eventoAEliminar?.total_inscritos ?? 0} personas inscritas dejan de ver el evento y su ticket`,
          'Desaparece del listado público y del panel de staff',
          'El historial de asistencia, los pagos y las evidencias se conservan en la base de datos, pero ya no serán consultables desde el panel',
        ]}
        confirmLabel="Eliminar evento"
      />

      <ConfirmDialog
        isOpen={confirmarQuitarConcurso}
        onClose={() => setConfirmarQuitarConcurso(false)}
        onConfirm={guardarEvento}
        loading={isSubmitting}
        tone="warning"
        title="Desactivar las funciones de concurso"
        message={`“${currentEvento?.nombre ?? ''}” tiene una configuración de competencia guardada.`}
        consequences={[
          'Modalidad, plataforma y URL del concurso',
          'El rango de integrantes por equipo',
          'El requisito de asesor',
        ]}
        confirmLabel="Sí, desactivar"
      />
    </div>
  );
}
