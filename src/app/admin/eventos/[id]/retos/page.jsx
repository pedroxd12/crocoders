'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Plus, Pencil, Trash2, Target, ImageOff, ArrowUp, ArrowDown, ExternalLink,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import Table from '@/components/ui/Table';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FlyerUploader from '@/components/FlyerUploader';
import { fetcher } from '@/lib/fetcher';

const FORM_ID = 'formulario-reto';

// Los cinco colores de tarjeta del manual de marca del HackaItlac. El número es
// el que consume la landing (styles.cardTone1..5), así que no se reordena.
const TONOS = [
  { value: 1, label: '1 · Azul marino' },
  { value: 2, label: '2 · Amarillo' },
  { value: 3, label: '3 · Blanco' },
  { value: 4, label: '4 · Azul' },
  { value: 5, label: '5 · Azul pálido' },
];

const FORM_VACIO = {
  titulo: '',
  lede: '',
  resumen: '',
  descripcion: '',
  entregable: '',
  patrocinador: '',
  premio: '',
  tags: '',
  criterios: '',
  cupo_equipos: '',
  imagen_url: null,
  imagen_key: undefined,
  tono: 1,
  activo: true,
};

// Listas que el admin escribe como texto: una etiqueta o un criterio por línea.
// Es el formato más rápido de teclear y de pegar desde la convocatoria.
const aLineas = (texto) =>
  String(texto || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

const aTexto = (lista) => (Array.isArray(lista) ? lista.join('\n') : '');

function Seccion({ title, description, children }) {
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-4">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export default function RetosEventoAdmin() {
  const { id } = useParams();
  const router = useRouter();

  const { data: evento } = useSWR(id ? `/api/admin/eventos/${id}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const {
    data: retos,
    error: retosError,
    isLoading,
    mutate: mutarRetos,
  } = useSWR(id ? `/api/admin/eventos/${id}/retos` : null, fetcher, { revalidateOnFocus: false });

  const [modalAbierto, setModalAbierto] = useState(false);
  const [retoActual, setRetoActual] = useState(null);
  const [formData, setFormData] = useState(FORM_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [retoABorrar, setRetoABorrar] = useState(null);
  const [borrando, setBorrando] = useState(false);

  const lista = useMemo(() => (Array.isArray(retos) ? retos : []), [retos]);

  // La unidad del cupo depende del evento: en un concurso por equipos cada
  // inscripción es un equipo; en uno individual, una persona.
  const esEquipos = Boolean(evento?.id_concurso && evento?.modalidad === 'equipos');
  const unidad = esEquipos ? 'equipos' : 'inscripciones';

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const abrirCrear = () => {
    setRetoActual(null);
    setFormData({
      ...FORM_VACIO,
      // Se propone el siguiente color de la rotación y, si ya hay retos, se
      // heredan sus criterios de evaluación: en la práctica son los mismos para
      // todos los desafíos de una convocatoria.
      tono: (lista.length % 5) + 1,
      criterios: aTexto(lista[0]?.criterios),
      premio: lista[0]?.premio || '',
    });
    setModalAbierto(true);
  };

  const abrirEditar = (reto) => {
    setRetoActual(reto);
    setFormData({
      titulo: reto.titulo || '',
      lede: reto.lede || '',
      resumen: reto.resumen || '',
      descripcion: reto.descripcion || '',
      entregable: reto.entregable || '',
      patrocinador: reto.patrocinador || '',
      premio: reto.premio || '',
      tags: aTexto(reto.tags),
      criterios: aTexto(reto.criterios),
      cupo_equipos: reto.cupo_equipos ?? '',
      imagen_url: reto.imagen_url ?? null,
      // `undefined` a propósito: si no se toca la imagen, la clave no viaja en
      // el PUT y el servidor conserva la que ya hay (igual que el flyer).
      imagen_key: undefined,
      tono: reto.tono || 1,
      activo: reto.activo !== false,
    });
    setModalAbierto(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!formData.titulo.trim()) {
      toast.error('El desafío necesita un título.');
      return;
    }

    setEnviando(true);
    try {
      const payload = {
        ...formData,
        tags: aLineas(formData.tags),
        criterios: aLineas(formData.criterios),
        cupo_equipos: formData.cupo_equipos === '' ? null : Number(formData.cupo_equipos),
        tono: Number(formData.tono),
      };
      // Sin imagen tocada no se manda la clave: así el PUT no la borra.
      if (payload.imagen_key === undefined) delete payload.imagen_key;

      const url = retoActual
        ? `/api/admin/eventos/${id}/retos/${retoActual.id_reto}`
        : `/api/admin/eventos/${id}/retos`;

      const res = await fetch(url, {
        method: retoActual ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el desafío');

      toast.success(retoActual ? 'Desafío actualizado' : 'Desafío creado');
      setModalAbierto(false);
      mutarRetos();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEnviando(false);
    }
  };

  // Reordenar intercambia el `orden` de dos retos: es lo que decide la posición
  // en la baraja de la landing y el número (01, 02…) que se pinta en la tarjeta.
  const mover = async (indice, direccion) => {
    const destino = indice + direccion;
    if (destino < 0 || destino >= lista.length) return;
    const a = lista[indice];
    const b = lista[destino];
    try {
      await Promise.all([
        fetch(`/api/admin/eventos/${id}/retos/${a.id_reto}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orden: b.orden }),
        }),
        fetch(`/api/admin/eventos/${id}/retos/${b.id_reto}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orden: a.orden }),
        }),
      ]);
      mutarRetos();
    } catch {
      toast.error('No se pudo reordenar.');
    }
  };

  const alternarActivo = async (reto) => {
    try {
      const res = await fetch(`/api/admin/eventos/${id}/retos/${reto.id_reto}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !reto.activo }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Error');
      mutarRetos();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const confirmarBorrado = async () => {
    if (!retoABorrar) return;
    setBorrando(true);
    try {
      const res = await fetch(`/api/admin/eventos/${id}/retos/${retoABorrar.id_reto}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
      toast.success('Desafío eliminado');
      setRetoABorrar(null);
      mutarRetos();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBorrando(false);
    }
  };

  const columnas = [
    {
      header: '#',
      align: 'center',
      render: (_reto, i) => <span className="tabular-nums text-muted">{String(i + 1).padStart(2, '0')}</span>,
    },
    {
      header: 'Desafío',
      render: (reto) => (
        <div className="flex items-center gap-3">
          {reto.imagen_url ? (
            <Image
              src={reto.imagen_url}
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
            <div className="truncate font-medium text-fg">{reto.titulo}</div>
            <div className="truncate text-xs text-muted">{reto.lede || reto.patrocinador || '—'}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Cupo',
      align: 'center',
      render: (reto) => (
        <div className="text-sm">
          <span className="tabular-nums font-medium text-fg">{reto.equipos_ocupados}</span>
          <span className="text-muted"> / {reto.cupo_equipos ?? '∞'}</span>
          {reto.lleno && <div className="mt-0.5 text-xs text-danger">Cupo lleno</div>}
        </div>
      ),
    },
    {
      header: 'Estado',
      align: 'center',
      render: (reto) => (
        <button type="button" onClick={() => alternarActivo(reto)} title="Activar o retirar el desafío">
          <Badge tone={reto.activo ? 'success' : 'neutral'}>{reto.activo ? 'Activo' : 'Retirado'}</Badge>
        </button>
      ),
    },
    {
      header: 'Acciones',
      align: 'right',
      render: (reto, i) => (
        <div className="flex justify-end gap-1">
          <IconButton
            icon={ArrowUp}
            label="Subir en el orden"
            tone="neutral"
            onClick={() => mover(i, -1)}
            disabled={i === 0}
          />
          <IconButton
            icon={ArrowDown}
            label="Bajar en el orden"
            tone="neutral"
            onClick={() => mover(i, 1)}
            disabled={i === lista.length - 1}
          />
          <IconButton icon={Pencil} label="Editar desafío" tone="brand" onClick={() => abrirEditar(reto)} />
          <IconButton
            icon={Trash2}
            label="Eliminar desafío"
            tone="danger"
            onClick={() => setRetoABorrar(reto)}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <button
        onClick={() => router.push('/admin/eventos')}
        className="mb-4 flex items-center gap-2 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Volver a eventos
      </button>

      <PageHeader
        title="Desafíos del evento"
        description={
          evento?.nombre
            ? `${evento.nombre} · cada desafío admite un número limitado de ${unidad} y se elige al inscribirse.`
            : `Cada desafío admite un número limitado de ${unidad} y se elige al inscribirse.`
        }
        actions={
          <>
            {evento?.slug && (
              <Button
                variant="secondary"
                onClick={() => window.open(`/${evento.slug}`, '_blank', 'noopener')}
              >
                <ExternalLink size={16} aria-hidden="true" /> Ver landing
              </Button>
            )}
            <Button onClick={abrirCrear}>
              <Plus size={16} aria-hidden="true" /> Nuevo desafío
            </Button>
          </>
        }
      />

      {retosError && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          No se pudieron cargar los desafíos.{' '}
          <button type="button" onClick={() => mutarRetos()} className="underline">
            Reintentar
          </button>
        </p>
      )}

      <Table
        columns={columnas}
        data={lista}
        getRowKey={(reto) => reto.id_reto}
        loading={isLoading && !retos}
        emptyMessage={
          <EmptyState
            icon={Target}
            title="Este evento todavía no tiene desafíos"
            description="Al crear el primero, la inscripción empezará a pedir que se elija uno y cada desafío llevará su propio cupo."
            action={
              <Button onClick={abrirCrear}>
                <Plus size={16} aria-hidden="true" /> Nuevo desafío
              </Button>
            }
          />
        }
      />

      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={retoActual ? 'Editar desafío' : 'Nuevo desafío'}
        description="Lo que escribas aquí es exactamente lo que se publica en la tarjeta y en el detalle del desafío."
        size="xl"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setModalAbierto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" form={FORM_ID} loading={enviando}>
              {retoActual ? 'Guardar cambios' : 'Crear desafío'}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={guardar} className="space-y-5" noValidate>
          <Seccion title="Tarjeta" description="Lo que se ve sin abrir el desafío.">
            <Input
              label="Título"
              name="titulo"
              value={formData.titulo}
              onChange={handleChange}
              required
              placeholder="Ej. Clasificación arancelaria"
            />
            <Input
              label="Frase de entrada"
              name="lede"
              value={formData.lede}
              onChange={handleChange}
              placeholder="Una línea que resuma el reto"
              help="Se lee grande, justo debajo del título."
            />
            <Textarea
              label="Resumen"
              name="resumen"
              rows={3}
              value={formData.resumen}
              onChange={handleChange}
              placeholder="Dos o tres líneas con el porqué del reto."
            />
            <Textarea
              label="Etiquetas"
              name="tags"
              rows={3}
              value={formData.tags}
              onChange={handleChange}
              placeholder={'IA\nCiencia de datos\nComercio exterior'}
              help="Una por línea. Se pintan como pastillas en la tarjeta."
            />
          </Seccion>

          <Seccion title="Detalle" description="Lo que se lee al abrir el desafío.">
            <Textarea
              label="El reto"
              name="descripcion"
              rows={5}
              value={formData.descripcion}
              onChange={handleChange}
              placeholder="Descripción completa del problema a resolver."
            />
            <Textarea
              label="Qué se entrega"
              name="entregable"
              rows={3}
              value={formData.entregable}
              onChange={handleChange}
              placeholder="Prototipo funcional que…"
            />
            <Textarea
              label="Criterios de evaluación"
              name="criterios"
              rows={5}
              value={formData.criterios}
              onChange={handleChange}
              placeholder={'Propuesta de valor\nGrado de solución al desafío\nInnovación por el uso de tecnología'}
              help="Uno por línea. Suelen ser los mismos para todos los desafíos de la convocatoria."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Patrocinador"
                name="patrocinador"
                value={formData.patrocinador}
                onChange={handleChange}
                placeholder="Quién pone el desafío"
              />
              <Input
                label="Premio"
                name="premio"
                value={formData.premio}
                onChange={handleChange}
                placeholder="$15,000 MXN"
                help="Texto libre; se muestra en la ficha del desafío."
              />
            </div>
          </Seccion>

          <Seccion
            title="Cupo y publicación"
            description={`El cupo del desafío se cuenta en ${unidad} y es independiente del aforo del evento.`}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label={esEquipos ? 'Cupo de equipos' : 'Cupo de inscripciones'}
                type="number"
                name="cupo_equipos"
                min="1"
                value={formData.cupo_equipos}
                onChange={handleChange}
                placeholder="Sin límite"
                help="Déjalo vacío para no poner tope propio: entonces sólo manda el aforo del evento."
              />
              <Select
                label="Color de la tarjeta"
                name="tono"
                value={formData.tono}
                onChange={handleChange}
                options={TONOS}
                help="Los cinco colores del manual de marca."
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="reto-activo"
                name="activo"
                type="checkbox"
                checked={formData.activo}
                onChange={handleChange}
                className="h-4 w-4 accent-brand"
              />
              <label htmlFor="reto-activo" className="cursor-pointer select-none text-sm font-medium text-fg">
                Publicado y admitiendo registros
              </label>
            </div>
            <p className="ml-6 -mt-2 text-xs text-faint">
              Al desactivarlo desaparece del formulario de inscripción y de la landing, pero conserva los
              equipos que ya se registraron en él.
            </p>

            <div>
              <p className="mb-1.5 block text-sm font-medium text-muted">Imagen del desafío</p>
              <FlyerUploader
                nombre="imagen"
                url={formData.imagen_url}
                onChange={({ url, key }) =>
                  setFormData((prev) => ({ ...prev, imagen_url: url, imagen_key: key }))
                }
                onError={(mensaje) => toast.error(mensaje)}
              />
              <p className="mt-1.5 text-xs text-faint">
                Opcional. Sin imagen, la tarjeta usa la ilustración vectorial del evento.
              </p>
            </div>
          </Seccion>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(retoABorrar)}
        onClose={() => setRetoABorrar(null)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        title={`Eliminar “${retoABorrar?.titulo ?? ''}”`}
        message="El desafío desaparece del evento y de la landing. Si ya tiene inscripciones, el servidor lo rechaza: en ese caso desactívalo."
        consequences={[
          'Deja de aparecer en el formulario de inscripción',
          'Se borra su imagen del almacenamiento',
        ]}
        confirmLabel="Eliminar desafío"
      />
    </div>
  );
}
