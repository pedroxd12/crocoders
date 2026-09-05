'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Plus, Pencil, Trash2, FileBadge, Download, RefreshCw, Wand2, Eye, FileText,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import PlantillaPdfUploader from '@/components/admin/PlantillaPdfUploader';
import { fetcher } from '@/lib/fetcher';
import {
  TIPOS_PLANTILLA, ETIQUETA_TIPO_PLANTILLA, AUDIENCIAS, CAMPOS_DISPONIBLES, ETIQUETA_CAMPO,
  FUENTES, ALINEACIONES, PRESETS, campoNuevo, LIMITES,
} from '@/lib/documentos-campos';

const NUEVA_VACIA = { nombre: '', tipo: 'certificado', pdf: null, pagina: '1' };

/** Descarga un blob como archivo (panel de administración, no artifact). */
function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Nombre de archivo que manda el servidor en Content-Disposition. */
function nombreDeRespuesta(res, respaldo) {
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename="([^"]+)"/.exec(cd);
  return m ? m[1] : respaldo;
}

async function pedirPdf(idPlantilla, cuerpo) {
  const res = await fetch(`/api/admin/plantillas/${idPlantilla}/generar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo generar el PDF');
  }
  return { blob: await res.blob(), nombre: nombreDeRespuesta(res, 'documentos.pdf'), total: Number(res.headers.get('X-Documentos-Generados')) || 0 };
}

/* ------------------------------------------------------------- editor */

function FilaCampo({ campo, indice, onChange, onQuitar }) {
  const set = (parche) => onChange(indice, parche);
  const esQr = campo.clave === 'qr';
  const esTexto = campo.clave === 'texto';
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex items-start gap-2">
        <Select
          aria-label="Dato"
          value={campo.clave}
          onChange={(e) => set({ ...campoNuevo(e.target.value), x: campo.x, y: campo.y })}
          options={CAMPOS_DISPONIBLES.map((c) => ({ value: c.clave, label: c.label }))}
          wrapperClassName="flex-1"
        />
        <IconButton icon={Trash2} label="Quitar campo" tone="danger" onClick={() => onQuitar(indice)} className="mt-0.5" />
      </div>
      {esTexto && (
        <Input
          aria-label="Texto fijo"
          value={campo.texto}
          onChange={(e) => set({ texto: e.target.value })}
          placeholder="Texto que se imprime tal cual"
          maxLength={300}
          wrapperClassName="mt-2"
        />
      )}
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Input label="X %" type="number" min="0" max="100" step="0.5" value={campo.x} onChange={(e) => set({ x: e.target.value })} />
        <Input label="Y %" type="number" min="0" max="100" step="0.5" value={campo.y} onChange={(e) => set({ y: e.target.value })} />
        <Input
          label={esQr ? 'Lado %' : 'Tamaño'}
          type="number"
          min={esQr ? LIMITES.qrMin : LIMITES.tamanoMin}
          max={esQr ? LIMITES.qrMax : LIMITES.tamanoMax}
          step="0.5"
          value={campo.tamano}
          onChange={(e) => set({ tamano: e.target.value })}
        />
        <Select
          label="Alinear"
          value={campo.alineacion}
          onChange={(e) => set({ alineacion: e.target.value })}
          options={ALINEACIONES}
        />
        {!esQr && (
          <>
            <Select label="Fuente" value={campo.fuente} onChange={(e) => set({ fuente: e.target.value })} options={FUENTES} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted" htmlFor={`color-${indice}`}>Color</label>
              <input
                id={`color-${indice}`}
                type="color"
                value={campo.color}
                onChange={(e) => set({ color: e.target.value })}
                className="h-10 w-full cursor-pointer rounded-lg border border-line bg-surface-2 p-1"
              />
            </div>
          </>
        )}
      </div>
      {!esQr && (
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Input
            label="Ancho máx. %"
            type="number"
            min="0"
            max="100"
            value={campo.ancho}
            onChange={(e) => set({ ancho: e.target.value })}
            help="0 = sin límite. Si el texto no cabe, se reduce la letra."
            wrapperClassName="w-40"
          />
          <label className="flex cursor-pointer items-center gap-2 pt-5 text-sm text-muted">
            <input type="checkbox" checked={Boolean(campo.mayusculas)} onChange={(e) => set({ mayusculas: e.target.checked })} className="h-4 w-4 accent-brand" />
            Mayúsculas
          </label>
        </div>
      )}
    </div>
  );
}

function EditorPlantilla({ plantilla, onClose, onGuardado }) {
  const [nombre, setNombre] = useState(plantilla.nombre);
  const [tipo, setTipo] = useState(plantilla.tipo);
  const [pagina, setPagina] = useState(String(plantilla.pagina || 1));
  const [pdf, setPdf] = useState(null); // { url, key, nombre } sólo si se cambia
  const [campos, setCampos] = useState(plantilla.campos?.length ? plantilla.campos : PRESETS[plantilla.tipo] || []);
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState(null); // blob URL
  const [cargandoVista, setCargandoVista] = useState(false);
  const vistaRef = useRef(null);

  const cambiarCampo = (i, parche) => setCampos((prev) => prev.map((c, k) => (k === i ? { ...c, ...parche } : c)));
  const quitarCampo = (i) => setCampos((prev) => prev.filter((_, k) => k !== i));
  const agregarCampo = () => {
    if (campos.length >= LIMITES.campos) {
      toast.info(`Máximo ${LIMITES.campos} campos por plantilla.`);
      return;
    }
    setCampos((prev) => [...prev, campoNuevo('nombre', { y: 50 + prev.length * 4 })]);
  };
  const aplicarPreset = () => setCampos(PRESETS[tipo] || []);

  const actualizarVista = useCallback(async () => {
    setCargandoVista(true);
    try {
      // El PDF recién subido todavía no está guardado: la vista previa usa el
      // que hay en la base. Se avisa para no confundir.
      const { blob } = await pedirPdf(plantilla.id_plantilla, { muestra: true, campos, disposicion: 'inline' });
      if (vistaRef.current) URL.revokeObjectURL(vistaRef.current);
      const url = URL.createObjectURL(blob);
      vistaRef.current = url;
      setVista(url);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCargandoVista(false);
    }
  }, [plantilla.id_plantilla, campos]);

  useEffect(() => () => {
    if (vistaRef.current) URL.revokeObjectURL(vistaRef.current);
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    if (campos.length === 0) {
      toast.error('Agrega al menos un campo.');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/admin/plantillas/${plantilla.id_plantilla}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          tipo,
          pagina: Number(pagina) || 1,
          campos,
          ...(pdf ? { pdf_url: pdf.url, pdf_key: pdf.key } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      toast.success('Plantilla guardada');
      onGuardado();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Diseño · ${plantilla.nombre}`}
      description="Coloca cada dato con coordenadas en % de la página (0,0 = esquina superior izquierda). Genera la vista previa para comprobar."
      size="3xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button type="submit" form="formulario-plantilla" loading={guardando}>Guardar diseño</Button>
        </>
      }
    >
      <form id="formulario-plantilla" onSubmit={guardar} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
            <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={120} />
            <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} options={TIPOS_PLANTILLA} wrapperClassName="sm:w-52" />
            <Input label="Página" type="number" min="1" max="50" value={pagina} onChange={(e) => setPagina(e.target.value)} wrapperClassName="sm:w-24" help="Del PDF" />
          </div>
          <PlantillaPdfUploader
            archivo={pdf?.nombre || plantilla.pdf_key}
            onChange={(f) => {
              setPdf(f);
              toast.info('El nuevo PDF se usará al guardar.');
            }}
            onError={(m) => toast.error(m)}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <p className="text-sm font-semibold text-fg">Campos ({campos.length})</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={aplicarPreset} title="Sustituye los campos por el diseño sugerido para este tipo">
                <Wand2 size={14} aria-hidden="true" /> Diseño sugerido
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={agregarCampo}>
                <Plus size={14} aria-hidden="true" /> Campo
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {campos.length === 0 && <p className="text-sm text-faint">Sin campos. Añade uno o aplica el diseño sugerido.</p>}
            {campos.map((c, i) => (
              <FilaCampo key={i} campo={c} indice={i} onChange={cambiarCampo} onQuitar={quitarCampo} />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-fg">Vista previa (datos de muestra)</p>
            <Button type="button" size="sm" variant="secondary" onClick={actualizarVista} loading={cargandoVista}>
              <RefreshCw size={14} aria-hidden="true" /> Actualizar
            </Button>
          </div>
          {vista ? (
            <iframe
              title="Vista previa de la plantilla"
              src={`${vista}#toolbar=0&navpanes=0&view=FitH`}
              className="h-[60vh] w-full rounded-lg border border-line bg-white"
            />
          ) : (
            <button
              type="button"
              onClick={actualizarVista}
              className="flex h-[60vh] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 text-sm text-muted hover:text-fg"
            >
              <Eye size={22} aria-hidden="true" />
              Generar vista previa
            </button>
          )}
          <p className="text-xs text-faint">
            La vista previa usa el PDF guardado y los campos tal como están en pantalla, con una persona ficticia.
            {pdf ? ' El PDF recién subido se verá después de guardar.' : ''}
          </p>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------ generar */

function GenerarModal({ plantilla, ambito, id, audienciaInicial, onClose }) {
  const audiencias = AUDIENCIAS[ambito] || [];
  const [audiencia, setAudiencia] = useState(
    audiencias.some((a) => a.value === audienciaInicial) ? audienciaInicial : audiencias[0]?.value,
  );
  const [soloAsistieron, setSoloAsistieron] = useState(false);
  const [soloAcreditados, setSoloAcreditados] = useState(false);
  const [incluirAsesores, setIncluirAsesores] = useState(true);
  const [incluirEquipo, setIncluirEquipo] = useState(true);
  const [excluidas, setExcluidas] = useState(() => new Set());
  const [generando, setGenerando] = useState(false);

  const query = new URLSearchParams({
    ambito,
    id: String(id),
    audiencia,
    soloAsistieron: soloAsistieron ? '1' : '0',
    soloAcreditados: soloAcreditados ? '1' : '0',
    incluirAsesores: incluirAsesores ? '1' : '0',
    incluirEquipo: incluirEquipo ? '1' : '0',
  }).toString();
  const { data, isLoading } = useSWR(`/api/admin/documentos/personas?${query}`, fetcher, { revalidateOnFocus: false });
  const personas = useMemo(() => data?.personas ?? [], [data]);
  const seleccionadas = personas.filter((p) => !excluidas.has(p.clave));

  const alternar = (clave) =>
    setExcluidas((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });

  const generar = async () => {
    if (seleccionadas.length === 0) {
      toast.error('Marca al menos una persona.');
      return;
    }
    setGenerando(true);
    try {
      const { blob, nombre, total } = await pedirPdf(plantilla.id_plantilla, {
        audiencia,
        claves: excluidas.size ? seleccionadas.map((p) => p.clave) : undefined,
        opciones: { soloAsistieron, soloAcreditados, incluirAsesores, incluirEquipo },
        disposicion: 'attachment',
      });
      descargarBlob(blob, nombre);
      toast.success(`${total || seleccionadas.length} documento(s) generados.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setGenerando(false);
    }
  };

  const esEvento = ambito === 'evento';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Generar · ${plantilla.nombre}`}
      description="Un PDF con una página por persona. Marca a quién se le genera."
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={generando}>Cerrar</Button>
          <Button onClick={generar} loading={generando} disabled={seleccionadas.length === 0}>
            <Download size={16} aria-hidden="true" /> Descargar PDF ({seleccionadas.length})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Para quién"
          value={audiencia}
          onChange={(e) => {
            setAudiencia(e.target.value);
            setExcluidas(new Set());
          }}
          options={audiencias}
        />
        <div className="flex flex-wrap gap-4 text-sm text-muted">
          {esEvento && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={soloAsistieron} onChange={(e) => setSoloAsistieron(e.target.checked)} className="h-4 w-4 accent-brand" />
              Sólo quienes asistieron
            </label>
          )}
          {esEvento && audiencia === 'participantes' && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={incluirAsesores} onChange={(e) => setIncluirAsesores(e.target.checked)} className="h-4 w-4 accent-brand" />
              Incluir asesores de equipo
            </label>
          )}
          {esEvento && audiencia === 'ganadores' && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={incluirEquipo} onChange={(e) => setIncluirEquipo(e.target.checked)} className="h-4 w-4 accent-brand" />
              Un reconocimiento para el equipo, además de uno por integrante
            </label>
          )}
          {!esEvento && (
            <>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={soloAcreditados} onChange={(e) => setSoloAcreditados(e.target.checked)} className="h-4 w-4 accent-brand" />
                Sólo acreditados
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={soloAsistieron} onChange={(e) => setSoloAsistieron(e.target.checked)} className="h-4 w-4 accent-brand" />
                Sólo con alguna asistencia
              </label>
            </>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted">
          <span>{isLoading ? 'Cargando…' : `${seleccionadas.length} de ${personas.length} marcadas`}</span>
          <span className="flex gap-3">
            <button type="button" className="underline" onClick={() => setExcluidas(new Set())}>Todas</button>
            <button type="button" className="underline" onClick={() => setExcluidas(new Set(personas.map((p) => p.clave)))}>Ninguna</button>
          </span>
        </div>
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface-2 scrollbar-thin">
          {!isLoading && personas.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">No hay personas con esos criterios.</li>
          )}
          {personas.map((p) => (
            <li key={p.clave}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface">
                <input type="checkbox" checked={!excluidas.has(p.clave)} onChange={() => alternar(p.clave)} className="h-4 w-4 accent-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">
                    {p.nombre}
                    {p.tipo_entidad === 'equipo' && <Badge tone="warning" size="sm" className="ml-2">Equipo</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted">{[p.rol, p.detalle].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- panel */

export default function DocumentosPanel({ ambito, id, audienciaInicial = 'participantes', volverA }) {
  const router = useRouter();
  const urlContexto = ambito === 'evento' ? `/api/admin/eventos/${id}` : `/api/admin/programas/${id}`;
  const { data: contexto } = useSWR(id ? urlContexto : null, fetcher, { revalidateOnFocus: false });
  const clavePlantillas = id ? `/api/admin/plantillas?${ambito}=${id}` : null;
  const { data: plantillas, isLoading, mutate } = useSWR(clavePlantillas, fetcher, { revalidateOnFocus: false });
  const lista = useMemo(() => (Array.isArray(plantillas) ? plantillas : []), [plantillas]);

  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [nueva, setNueva] = useState(NUEVA_VACIA);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [generando, setGenerando] = useState(null);
  const [aBorrar, setABorrar] = useState(null);
  const [borrando, setBorrando] = useState(false);

  const crear = async (e) => {
    e.preventDefault();
    if (!nueva.pdf) {
      toast.error('Sube el PDF de diseño.');
      return;
    }
    setCreando(true);
    try {
      const res = await fetch('/api/admin/plantillas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [ambito === 'evento' ? 'id_evento' : 'id_programa']: Number(id),
          tipo: nueva.tipo,
          nombre: nueva.nombre,
          pdf_url: nueva.pdf.url,
          pdf_key: nueva.pdf.key,
          pagina: Number(nueva.pagina) || 1,
          campos: PRESETS[nueva.tipo] || [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la plantilla');
      toast.success('Plantilla creada con el diseño sugerido. Ajusta las posiciones en «Diseño».');
      setNuevaAbierta(false);
      setNueva(NUEVA_VACIA);
      const actualizadas = await mutate();
      const creada = (actualizadas || []).find((p) => p.id_plantilla === data.id_plantilla);
      if (creada) setEditando(creada);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCreando(false);
    }
  };

  const borrar = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      const res = await fetch(`/api/admin/plantillas/${aBorrar.id_plantilla}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
      toast.success('Plantilla eliminada');
      setABorrar(null);
      mutate();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBorrando(false);
    }
  };

  const nombreContexto = contexto?.nombre;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => (volverA ? router.push(volverA) : router.back())} className="mb-4">
        <ArrowLeft size={16} aria-hidden="true" /> Volver
      </Button>

      <PageHeader
        title={nombreContexto ? `Documentos · ${nombreContexto}` : 'Certificados, gafetes y reconocimientos'}
        description="Sube un PDF con el diseño, indica dónde va cada dato y genera los documentos para participantes, staff, jueces o ganadores."
        actions={
          <Button onClick={() => setNuevaAbierta(true)}>
            <Plus size={16} aria-hidden="true" /> Nueva plantilla
          </Button>
        }
      />

      {isLoading && !plantillas ? (
        <Card><p className="text-sm text-muted">Cargando…</p></Card>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={FileBadge}
          title="Todavía no hay plantillas"
          description="Diseña el certificado o gafete en PDF, súbelo y coloca los datos encima. Después se generan en lote."
          action={
            <Button onClick={() => setNuevaAbierta(true)}>
              <Plus size={16} aria-hidden="true" /> Nueva plantilla
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => (
            <Card key={p.id_plantilla} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone={p.tipo === 'reconocimiento' ? 'warning' : p.tipo === 'gafete' ? 'info' : 'success'}>
                    {ETIQUETA_TIPO_PLANTILLA[p.tipo]}
                  </Badge>
                  <h3 className="mt-2 truncate text-base font-semibold text-fg">{p.nombre}</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    {p.campos.length} {p.campos.length === 1 ? 'campo' : 'campos'} · página {p.pagina}
                  </p>
                </div>
                <FileText size={20} className="shrink-0 text-faint" aria-hidden="true" />
              </div>
              {p.campos.length > 0 && (
                <p className="mt-3 line-clamp-2 text-xs text-faint">
                  {p.campos.map((c) => (c.clave === 'texto' ? `“${c.texto || '…'}”` : ETIQUETA_CAMPO[c.clave])).join(' · ')}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                <Button size="sm" onClick={() => setGenerando(p)} disabled={p.campos.length === 0}>
                  <Download size={14} aria-hidden="true" /> Generar
                </Button>
                <div className="flex gap-1">
                  <IconButton icon={Pencil} label="Diseño y campos" tone="brand" onClick={() => setEditando(p)} />
                  <IconButton icon={Trash2} label="Eliminar plantilla" tone="danger" onClick={() => setABorrar(p)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={nuevaAbierta}
        onClose={() => setNuevaAbierta(false)}
        title="Nueva plantilla"
        description="Después de crearla se abre el editor para colocar los datos."
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setNuevaAbierta(false)} disabled={creando}>Cancelar</Button>
            <Button type="submit" form="formulario-nueva-plantilla" loading={creando}>Crear</Button>
          </>
        }
      >
        <form id="formulario-nueva-plantilla" onSubmit={crear} className="space-y-4">
          <Input
            label="Nombre"
            value={nueva.nombre}
            onChange={(e) => setNueva((n) => ({ ...n, nombre: e.target.value }))}
            required
            placeholder="Constancia de participación"
            maxLength={120}
          />
          <Select
            label="Tipo"
            value={nueva.tipo}
            onChange={(e) => setNueva((n) => ({ ...n, tipo: e.target.value }))}
            options={TIPOS_PLANTILLA}
            help="Decide el diseño sugerido inicial; la audiencia se elige al generar."
          />
          <Input
            label="Página del PDF"
            type="number"
            min="1"
            max="50"
            value={nueva.pagina}
            onChange={(e) => setNueva((n) => ({ ...n, pagina: e.target.value }))}
            wrapperClassName="max-w-[10rem]"
            help="Si el PDF tiene varias páginas, cuál se usa de fondo."
          />
          <PlantillaPdfUploader
            archivo={nueva.pdf?.nombre}
            onChange={(f) => setNueva((n) => ({ ...n, pdf: f }))}
            onError={(m) => toast.error(m)}
          />
        </form>
      </Modal>

      {editando && (
        <EditorPlantilla
          key={editando.id_plantilla}
          plantilla={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            mutate();
          }}
        />
      )}

      {generando && (
        <GenerarModal
          key={generando.id_plantilla}
          plantilla={generando}
          ambito={ambito}
          id={id}
          audienciaInicial={generando.tipo === 'reconocimiento' ? 'ganadores' : audienciaInicial}
          onClose={() => setGenerando(null)}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(aBorrar)}
        onClose={() => setABorrar(null)}
        onConfirm={borrar}
        loading={borrando}
        title={`Eliminar “${aBorrar?.nombre ?? ''}”`}
        message="Se borra la plantilla y su PDF del almacenamiento. Los documentos ya descargados no se ven afectados."
        consequences={['Habrá que volver a subir el PDF y colocar los campos para generar de nuevo']}
        confirmLabel="Eliminar plantilla"
      />
    </div>
  );
}
