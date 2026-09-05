'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Plus, Pencil, Trash2, Trophy, Eye, EyeOff, Presentation, FileBadge, Medal,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { fetcher } from '@/lib/fetcher';
import { esPorEquipos } from '@/lib/aforo';
import { etiquetaPosicion } from '@/lib/ganadores';

const FORM_ID = 'formulario-ganador';
const GENERAL = 'general';

const FORM_VACIO = { id_reto: GENERAL, id_inscripcion: '', posicion: '1', titulo: '', premio: '', notas: '' };

const TONO_POSICION = { 1: 'warning', 2: 'neutral', 3: 'info' };

/** Nombre del premiado para el listado: equipo (con integrantes) o persona. */
function NombreGanador({ g }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-fg">{g.nombre}</p>
      {g.tipo === 'equipo' && g.integrantes?.length > 0 && (
        <p className="truncate text-xs text-muted">{g.integrantes.map((p) => p.nombre).join(' · ')}</p>
      )}
      {g.tipo !== 'equipo' && (g.institucion || g.correo) && (
        <p className="truncate text-xs text-muted">{g.institucion || g.correo}</p>
      )}
    </div>
  );
}

/** Fila de un ganador en el listado del panel. */
function FilaGanador({ g, onEditar, onBorrar }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold tabular-nums ${
          g.posicion === 1
            ? 'border-warning/40 bg-warning/10 text-warning'
            : g.posicion === 2
              ? 'border-line-strong bg-surface-3 text-fg'
              : g.posicion === 3
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-line bg-surface-2 text-muted'
        }`}
        aria-label={etiquetaPosicion(g.posicion)}
      >
        {g.posicion}
      </span>
      <NombreGanador g={g} />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {g.titulo && <Badge tone={TONO_POSICION[g.posicion] || 'neutral'}>{g.titulo}</Badge>}
        {g.premio && <span className="hidden text-xs text-muted sm:inline">{g.premio}</span>}
        <IconButton icon={Pencil} label="Editar" tone="brand" onClick={() => onEditar(g)} />
        <IconButton icon={Trash2} label="Eliminar" tone="danger" onClick={() => onBorrar(g)} />
      </div>
    </li>
  );
}

/** Bloque de un desafío (o de la clasificación general) con sus ganadores. */
function Grupo({ titulo, subtitulo, ganadores, idReto, onAgregar, onEditar, onBorrar }) {
  return (
    <Card className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-xs text-muted">{subtitulo}</p>}
        </div>
        <Button size="sm" variant="secondary" onClick={() => onAgregar(idReto)}>
          <Plus size={14} aria-hidden="true" /> Agregar
        </Button>
      </div>
      {ganadores.length === 0 ? (
        <p className="mt-3 text-sm text-faint">Sin ganadores registrados.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {ganadores.map((g) => <FilaGanador key={g.id_ganador} g={g} onEditar={onEditar} onBorrar={onBorrar} />)}
        </ul>
      )}
    </Card>
  );
}

export default function GanadoresEventoAdmin() {
  const { id } = useParams();
  const router = useRouter();

  const { data: evento } = useSWR(id ? `/api/admin/eventos/${id}` : null, fetcher, { revalidateOnFocus: false });
  const { data: datos, isLoading, mutate } = useSWR(id ? `/api/admin/eventos/${id}/ganadores` : null, fetcher, {
    revalidateOnFocus: false,
  });
  // Candidatos a premiar: las inscripciones vivas del evento.
  const { data: asistentes } = useSWR(id ? `/api/admin/eventos/${id}/asistentes` : null, fetcher, {
    revalidateOnFocus: false,
  });
  const { data: retos } = useSWR(id ? `/api/admin/eventos/${id}/retos` : null, fetcher, { revalidateOnFocus: false });

  const porEquipos = esPorEquipos(evento);
  const listaRetos = useMemo(() => (Array.isArray(retos) ? retos : []), [retos]);
  const inscripciones = useMemo(() => (Array.isArray(asistentes) ? asistentes : []), [asistentes]);
  const general = datos?.general ?? [];
  const porReto = datos?.retos ?? [];
  const publicado = Boolean(datos?.publicado);
  const total = Number(datos?.total) || 0;

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [aBorrar, setABorrar] = useState(null);
  const [borrando, setBorrando] = useState(false);
  const [publicando, setPublicando] = useState(false);

  // Inscripciones que caben en el selector: si se premia un desafío, sólo las
  // que se inscribieron en ÉL (un equipo no puede ganar un reto en el que no
  // compitió); en la general, todas.
  const opcionesInscripcion = useMemo(() => {
    const idReto = form.id_reto === GENERAL ? null : Number(form.id_reto);
    return inscripciones
      .filter((a) => idReto == null || Number(a.id_reto) === idReto)
      .map((a) => ({
        value: String(a.id_inscripcion),
        label: `${a.nombre_completo}${a.reto_titulo && idReto == null ? ` — ${a.reto_titulo}` : ''}`,
      }));
  }, [inscripciones, form.id_reto]);

  const abrirCrear = (idReto = GENERAL) => {
    setEditando(null);
    // Siguiente posición libre dentro del grupo elegido.
    const grupo = idReto === GENERAL ? general : (porReto.find((r) => String(r.id_reto) === String(idReto))?.ganadores ?? []);
    const usadas = new Set(grupo.map((g) => g.posicion));
    let pos = 1;
    while (usadas.has(pos)) pos += 1;
    setForm({ ...FORM_VACIO, id_reto: String(idReto), posicion: String(pos) });
    setModalAbierto(true);
  };

  const abrirEditar = (g) => {
    setEditando(g);
    setForm({
      id_reto: g.id_reto == null ? GENERAL : String(g.id_reto),
      id_inscripcion: String(g.id_inscripcion),
      posicion: String(g.posicion),
      titulo: g.titulo || '',
      premio: g.premio || '',
      notas: g.notas || '',
    });
    setModalAbierto(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.id_inscripcion && !editando) {
      toast.error('Elige a quién se premia.');
      return;
    }
    setEnviando(true);
    try {
      const payload = {
        id_reto: form.id_reto === GENERAL ? null : Number(form.id_reto),
        posicion: Number(form.posicion),
        titulo: form.titulo,
        premio: form.premio,
        notas: form.notas,
      };
      const url = editando
        ? `/api/admin/eventos/${id}/ganadores/${editando.id_ganador}`
        : `/api/admin/eventos/${id}/ganadores`;
      const res = await fetch(url, {
        method: editando ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando ? payload : { ...payload, id_inscripcion: Number(form.id_inscripcion) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      toast.success(editando ? 'Ganador actualizado' : 'Ganador registrado');
      setModalAbierto(false);
      mutate();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEnviando(false);
    }
  };

  const confirmarBorrado = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      const res = await fetch(`/api/admin/eventos/${id}/ganadores/${aBorrar.id_ganador}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
      toast.success('Ganador eliminado');
      setABorrar(null);
      mutate();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBorrando(false);
    }
  };

  const alternarPublicacion = async () => {
    setPublicando(true);
    try {
      const res = await fetch(`/api/admin/eventos/${id}/ganadores`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultados_publicados: !publicado }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar la publicación');
      toast.success(data.resultados_publicados ? 'Resultados publicados en la web' : 'Resultados ocultos');
      mutate();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setPublicando(false);
    }
  };

  // Desafíos sin ganadores todavía se listan también para poder agregarles.
  const gruposRetos = listaRetos.map((r) => ({
    id_reto: r.id_reto,
    titulo: r.titulo,
    patrocinador: r.patrocinador,
    ganadores: porReto.find((x) => x.id_reto === r.id_reto)?.ganadores ?? [],
  }));

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => router.push('/admin/eventos')} className="mb-4">
        <ArrowLeft size={16} aria-hidden="true" /> Volver a eventos
      </Button>

      <PageHeader
        title={evento?.nombre ? `Ganadores · ${evento.nombre}` : 'Ganadores'}
        description={
          listaRetos.length > 0
            ? 'Premia al ganador de cada desafío y, si aplica, la clasificación general. Publica cuando estén listos.'
            : 'Registra los lugares del concurso y publícalos cuando estén listos.'
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => window.open(`/eventos/${id}/ganadores/presentacion`, '_blank', 'noopener')}
              disabled={total === 0}
              title="Vista animada a pantalla completa para proyectar"
            >
              <Presentation size={16} aria-hidden="true" /> Presentación
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push(`/admin/eventos/${id}/documentos?audiencia=ganadores`)}
              disabled={total === 0}
            >
              <FileBadge size={16} aria-hidden="true" /> Reconocimientos
            </Button>
            <Button onClick={alternarPublicacion} loading={publicando} disabled={total === 0 && !publicado} variant={publicado ? 'secondary' : 'primary'}>
              {publicado ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              {publicado ? 'Ocultar de la web' : 'Publicar en la web'}
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge tone={publicado ? 'success' : 'neutral'}>{publicado ? 'Publicado' : 'Sin publicar'}</Badge>
        <span>
          {total} {total === 1 ? 'ganador' : 'ganadores'}
          {porEquipos ? ' · se premian equipos' : ' · se premian personas'}
        </span>
        {publicado && (
          <a
            href={`/eventos/${id}/ganadores`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline decoration-brand/40 underline-offset-4"
          >
            Ver página pública
          </a>
        )}
      </div>

      {isLoading && !datos ? (
        <Card><p className="text-sm text-muted">Cargando…</p></Card>
      ) : total === 0 && listaRetos.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Todavía no hay ganadores"
          description="Registra los lugares del concurso a partir de las inscripciones del evento."
          action={
            <Button onClick={() => abrirCrear(GENERAL)}>
              <Plus size={16} aria-hidden="true" /> Agregar ganador
            </Button>
          }
        />
      ) : (
        <>
          {gruposRetos.map((r) => (
            <Grupo
              key={r.id_reto}
              titulo={r.titulo}
              subtitulo={r.patrocinador ? `Desafío · ${r.patrocinador}` : 'Desafío'}
              ganadores={r.ganadores}
              idReto={r.id_reto}
              onAgregar={abrirCrear}
              onEditar={abrirEditar}
              onBorrar={setABorrar}
            />
          ))}
          <Grupo
            titulo={listaRetos.length > 0 ? 'Clasificación general' : 'Lugares'}
            subtitulo={listaRetos.length > 0 ? 'Opcional: premios generales del evento, además de los de cada desafío.' : null}
            ganadores={general}
            idReto={GENERAL}
            onAgregar={abrirCrear}
            onEditar={abrirEditar}
            onBorrar={setABorrar}
          />
        </>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editando ? 'Editar ganador' : 'Agregar ganador'}
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setModalAbierto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" form={FORM_ID} loading={enviando}>
              {editando ? 'Guardar' : 'Agregar'}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={guardar} className="space-y-4">
          {listaRetos.length > 0 && (
            <Select
              label="Premio de"
              value={form.id_reto}
              onChange={(e) => setForm((f) => ({ ...f, id_reto: e.target.value, id_inscripcion: editando ? f.id_inscripcion : '' }))}
              options={[
                { value: GENERAL, label: 'Clasificación general' },
                ...listaRetos.map((r) => ({ value: String(r.id_reto), label: `Desafío: ${r.titulo}` })),
              ]}
            />
          )}
          {editando ? (
            <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
              <p className="text-xs text-faint">Premiado</p>
              <p className="font-medium text-fg">{editando.nombre}</p>
            </div>
          ) : (
            <Select
              label={porEquipos ? 'Equipo' : 'Participante'}
              value={form.id_inscripcion}
              onChange={(e) => setForm((f) => ({ ...f, id_inscripcion: e.target.value }))}
              required
              placeholder={opcionesInscripcion.length ? 'Selecciona' : 'No hay inscripciones en este grupo'}
              options={opcionesInscripcion}
              help={form.id_reto !== GENERAL ? 'Sólo aparecen las inscripciones de ese desafío.' : undefined}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Lugar"
              type="number"
              min="1"
              max="100"
              value={form.posicion}
              onChange={(e) => setForm((f) => ({ ...f, posicion: e.target.value }))}
              required
              help={`Se mostrará como «${etiquetaPosicion(Number(form.posicion) || 1, form.titulo)}».`}
            />
            <Input
              label="Etiqueta (opcional)"
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder="Mención honorífica"
              maxLength={120}
            />
          </div>
          <Input
            label="Premio (opcional)"
            value={form.premio}
            onChange={(e) => setForm((f) => ({ ...f, premio: e.target.value }))}
            placeholder="$15,000 MXN, beca, estancia…"
            maxLength={200}
          />
          <Textarea
            label="Notas internas"
            rows={2}
            value={form.notas}
            onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            help="No se publican."
          />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(aBorrar)}
        onClose={() => setABorrar(null)}
        onConfirm={confirmarBorrado}
        loading={borrando}
        title={`Quitar a “${aBorrar?.nombre ?? ''}” de los ganadores`}
        message={`Deja de aparecer como ${etiquetaPosicion(aBorrar?.posicion ?? 1, aBorrar?.titulo)}${aBorrar?.reto_titulo ? ` de «${aBorrar.reto_titulo}»` : ''}.`}
        consequences={['Si los resultados están publicados, desaparece también de la web']}
        confirmLabel="Quitar"
      />

      <p className="mt-6 flex items-center gap-2 text-xs text-faint">
        <Medal size={14} aria-hidden="true" />
        Los reconocimientos se generan desde «Reconocimientos» con una plantilla PDF: uno por equipo y uno por integrante.
      </p>
    </div>
  );
}
