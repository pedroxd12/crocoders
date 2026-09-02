'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import { Check, Plus, Search, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import {
  CamposInvitado,
  INVITADO_VACIO,
  validarInvitado,
  limpiarInvitadoPayload,
  INTEGRANTE_EQUIPO_VACIO,
  CamposInstitucionIntegrante,
  validarInstitucionIntegrantes,
  integrantesEquipoPayload,
} from '@/components/eventos/RegistroInvitado';
import { rangoEquipos } from '@/components/eventos/EventoBadges';
import { TALLAS_PLAYERA } from '@/lib/registro-campos';
import { fetcher } from '@/lib/fetcher';

/**
 * Registro manual de asistentes desde el panel admin.
 *
 * Sustituye al <select size={8}> nativo que listaba a TODO el sistema como
 * "Nombre (tipo) — correo" en JSON: sin buscador, con el texto cortado por el
 * ancho del control y sin pedir ninguno de los datos del formulario público.
 *
 * Pide lo MISMO que pediría el formulario público del evento:
 *  - Evento individual → elegir a un miembro/invitado existente (con buscador)
 *    o dar de alta a un invitado nuevo con la ficha completa compartida
 *    (CamposInvitado), talla incluida si el evento la solicita.
 *  - Evento por equipos → el formulario de equipo completo (nombre, asesores
 *    hasta el tope del concurso e integrantes con todos sus campos).
 */

// La talla va aquí porque al asesor también se le entrega playera (el escáner
// deja marcarla): sin ella el staff no sabe cuál darle.
const ASESOR_VACIO = { nombre: '', email: '', telefono: '', talla_playera: '' };

// Con cientos de usuarios el listado se corta y se pide afinar la búsqueda:
// pintar el catálogo entero era parte de lo que hacía inusable el modal viejo.
const MAX_RESULTADOS = 50;

export default function RegistroManualModal({ isOpen, onClose, evento, eventoId, asistentes = [], onRegistered }) {
  // Mismas TRES condiciones que `esRegistroPorEquipos` en el detalle público
  // (src/app/eventos/[id]/page.jsx); si cambian en un lado, cambiar el otro.
  const esEquipos = Boolean(evento?.permite_equipos && evento?.id_concurso && evento?.modalidad === 'equipos');
  const solicitarTalla = Boolean(evento?.solicitar_talla);
  const minEq = Math.max(1, Number(evento?.min_integrantes_equipo) || 1);
  const maxEq = Number(evento?.max_integrantes_equipo) || null;
  const maxAsesores = Math.min(5, Math.max(1, Number(evento?.max_asesores) || 1));

  const [enviando, setEnviando] = useState(false);
  const [forzar, setForzar] = useState(false);

  // Individual: usuario existente o invitado nuevo.
  const [modo, setModo] = useState('existente');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [talla, setTalla] = useState('');
  const [invitado, setInvitado] = useState(INVITADO_VACIO);
  const [invitadoErrors, setInvitadoErrors] = useState({});

  // Equipo.
  const [nombreEquipo, setNombreEquipo] = useState('');
  const [integrantes, setIntegrantes] = useState([{ ...INTEGRANTE_EQUIPO_VACIO, es_capitan: true }]);
  const [asesores, setAsesores] = useState([{ ...ASESOR_VACIO }]);

  // El catálogo completo sólo se descarga con el modal abierto y en eventos
  // individuales (el endpoint no pagina).
  const { data: usersCatalog } = useSWR(
    isOpen && !esEquipos ? '/api/admin/users' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  // El formulario de equipo arranca ya con el mínimo de filas exigido, igual
  // que el público (abrir con una sola y fallar al enviar confundía). Se DERIVA
  // en render (nada de setState en un efecto): los handlers escriben siempre
  // sobre esta lista, así que el relleno se materializa al primer cambio.
  const filasIntegrantes = useMemo(() => {
    if (!esEquipos || integrantes.length >= minEq) return integrantes;
    const filas = [...integrantes];
    while (filas.length < minEq) filas.push({ ...INTEGRANTE_EQUIPO_VACIO });
    return filas;
  }, [esEquipos, integrantes, minEq]);

  const cerrar = () => {
    setModo('existente');
    setBusqueda('');
    setSeleccionado(null);
    setTalla('');
    setInvitado(INVITADO_VACIO);
    setInvitadoErrors({});
    setNombreEquipo('');
    setIntegrantes([{ ...INTEGRANTE_EQUIPO_VACIO, es_capitan: true }]);
    setAsesores([{ ...ASESOR_VACIO }]);
    setForzar(false);
    onClose();
  };

  // Excluye del listado a quien ya está inscrito. Se compara por CORREO además
  // de por id porque el endpoint de asistentes no siempre expone id_miembro /
  // id_invitado; las filas de tipo "Equipo" traen el correo del capitán.
  const disponibles = useMemo(() => {
    const catalogo = Array.isArray(usersCatalog) ? usersCatalog : [];
    const correosInscritos = new Set(
      asistentes.map((a) => a.correo?.trim().toLowerCase()).filter(Boolean),
    );
    return catalogo.filter((u) => {
      if (u.email && correosInscritos.has(u.email.trim().toLowerCase())) return false;
      return !asistentes.some(
        (a) =>
          (u.tipo === 'miembro' && a.id_miembro != null && a.id_miembro === u.id) ||
          (u.tipo === 'invitado' && a.id_invitado != null && a.id_invitado === u.id),
      );
    });
  }, [usersCatalog, asistentes]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = !q
      ? disponibles
      : disponibles.filter(
          (u) =>
            u.nombre_completo?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q),
        );
    return { visibles: lista.slice(0, MAX_RESULTADOS), total: lista.length };
  }, [disponibles, busqueda]);

  // --- Equipo: mismas operaciones que el formulario público ---
  // El parche de varios campos lo necesita el bloque de institución: cambiar
  // ITLAC↔otra limpia carrera y número de control en UNA sola actualización.
  const patchIntegrante = (idx, patch) => {
    setIntegrantes(filasIntegrantes.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };
  const setIntegrante = (idx, campo, valor) => {
    patchIntegrante(idx, { [campo]: valor });
  };
  const agregarIntegrante = () => {
    if (maxEq && filasIntegrantes.length >= maxEq) {
      toast.info(`El equipo ya tiene el máximo de ${maxEq} integrantes.`);
      return;
    }
    setIntegrantes([...filasIntegrantes, { ...INTEGRANTE_EQUIPO_VACIO }]);
  };
  const quitarIntegrante = (idx) => {
    if (filasIntegrantes.length <= minEq) {
      toast.info(minEq > 1
        ? `Este evento requiere equipos de al menos ${minEq} integrantes.`
        : 'Debes tener al menos un integrante.');
      return;
    }
    // El capitán es siempre la primera fila; si se borró, la nueva primera lo hereda.
    setIntegrantes(
      filasIntegrantes.filter((_, i) => i !== idx).map((m, i) => ({ ...m, es_capitan: i === 0 })),
    );
  };

  const setAsesor = (idx, campo, valor) => {
    setAsesores((prev) => prev.map((a, i) => (i === idx ? { ...a, [campo]: valor } : a)));
  };
  const agregarAsesor = () => {
    if (asesores.length >= maxAsesores) return;
    setAsesores((prev) => [...prev, { ...ASESOR_VACIO }]);
  };
  const quitarAsesor = (idx) => {
    if (asesores.length <= 1) return;
    setAsesores((prev) => prev.filter((_, i) => i !== idx));
  };

  const registrar = async (payload, mensajeExito) => {
    setEnviando(true);
    try {
      const res = await fetch('/api/admin/eventos/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al registrar');
      toast.success(mensajeExito);
      onRegistered?.();
      cerrar();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEnviando(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (esEquipos) {
      // Validaciones espejo del formulario público de equipos.
      if (filasIntegrantes.length < minEq) {
        toast.warning(`Debes registrar al menos ${minEq} integrantes.`);
        return;
      }
      if (filasIntegrantes.some((m) => !m.nombre || !m.email)) {
        toast.error('Completa nombre y correo de todos los integrantes.');
        return;
      }
      if (solicitarTalla && filasIntegrantes.some((m) => !m.talla_playera)) {
        toast.error('Indica la talla de playera de cada integrante.');
        return;
      }
      const errorInstitucion = validarInstitucionIntegrantes(filasIntegrantes);
      if (errorInstitucion) {
        toast.error(errorInstitucion);
        return;
      }
      const asesoresLlenos = asesores.filter((a) => a.nombre || a.email || a.telefono);
      if (evento?.requiere_asesor && (!asesoresLlenos[0]?.nombre || !asesoresLlenos[0]?.email)) {
        toast.error('La información del asesor es obligatoria para este evento.');
        return;
      }
      registrar(
        {
          id_evento: eventoId,
          tipo_usuario: 'equipo',
          equipo: { nombre: nombreEquipo },
          // Traduce `institucion_tipo` al nombre real de la institución y
          // descarta el número de control fuera del ITLAC.
          integrantes: integrantesEquipoPayload(filasIntegrantes),
          asesores: asesoresLlenos,
          forzar,
        },
        `Equipo “${nombreEquipo}” registrado con ${filasIntegrantes.length} integrante(s).`,
      );
      return;
    }

    if (modo === 'nuevo') {
      const errors = validarInvitado(invitado, { requiereTalla: solicitarTalla });
      setInvitadoErrors(errors);
      if (Object.keys(errors).length > 0) {
        toast.error('Revisa los campos marcados en rojo.');
        return;
      }
      registrar(
        {
          id_evento: eventoId,
          tipo_usuario: 'invitado_nuevo',
          invitado: limpiarInvitadoPayload(invitado),
          forzar,
        },
        `${invitado.nombre_completo} quedó registrado.`,
      );
      return;
    }

    if (!seleccionado) {
      toast.warning('Selecciona un usuario de la lista.');
      return;
    }
    registrar(
      {
        id_evento: eventoId,
        tipo_usuario: seleccionado.tipo,
        id_usuario: seleccionado.id,
        talla_playera: talla || undefined,
        forzar,
      },
      `${seleccionado.nombre_completo} quedó registrado.`,
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={cerrar}
      title={esEquipos ? 'Registrar equipo manualmente' : 'Registrar asistente manualmente'}
      description={
        esEquipos
          ? `Inscribe a un equipo sin que pase por el formulario público · ${rangoEquipos(minEq, maxEq)}`
          : 'Inscribe a un miembro o invitado sin que pase por el formulario público.'
      }
      size={esEquipos ? '2xl' : 'lg'}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={cerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" form="formulario-registro-manual" loading={enviando}>
            {esEquipos ? 'Registrar equipo' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form id="formulario-registro-manual" onSubmit={handleSubmit}>
        {esEquipos ? (
          <div className="space-y-5">
            <Input
              label="Nombre del equipo"
              value={nombreEquipo}
              onChange={(e) => setNombreEquipo(e.target.value)}
              required
              placeholder="Como aparecerá en el concurso"
            />

            <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-fg">
                  {asesores.length > 1 ? 'Asesores' : 'Asesor'}
                  {evento?.requiere_asesor
                    ? <span className="text-danger"> *</span>
                    : <span className="font-normal text-faint"> (opcional)</span>}
                </h4>
                {maxAsesores > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={agregarAsesor}
                    disabled={asesores.length >= maxAsesores}
                  >
                    <Plus size={14} aria-hidden="true" /> Agregar asesor ({asesores.length}/{maxAsesores})
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">
                {evento?.asesor_participa
                  ? 'En este concurso el asesor participa como integrante: inclúyelo también en la lista de integrantes.'
                  : 'El asesor acompaña al equipo y no ocupa lugar entre los integrantes.'}
              </p>
              {asesores.map((asesor, idx) => (
                <div key={idx} className="relative rounded-lg border border-line bg-surface p-3">
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => quitarAsesor(idx)}
                      aria-label={`Quitar asesor ${idx + 1}`}
                      className="absolute top-2 right-2 rounded p-1 text-danger hover:bg-surface-2"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                      label="Nombre"
                      value={asesor.nombre}
                      onChange={(e) => setAsesor(idx, 'nombre', e.target.value)}
                      required={Boolean(evento?.requiere_asesor) && idx === 0}
                    />
                    <Input
                      label="Email"
                      type="email"
                      value={asesor.email}
                      onChange={(e) => setAsesor(idx, 'email', e.target.value)}
                      required={Boolean(evento?.requiere_asesor) && idx === 0}
                    />
                    <Input
                      label="Teléfono"
                      value={asesor.telefono}
                      onChange={(e) => setAsesor(idx, 'telefono', e.target.value.replace(/\D/g, '').slice(0, 15))}
                      placeholder="10 dígitos"
                    />
                    {solicitarTalla && (
                      <Select
                        label="Talla de playera"
                        value={asesor.talla_playera || ''}
                        onChange={(e) => setAsesor(idx, 'talla_playera', e.target.value)}
                        options={TALLAS_PLAYERA}
                        placeholder="Selecciona la talla"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h4 className="text-sm font-bold text-fg">
                  Integrantes <span className="ml-2 text-sm font-normal text-muted">{rangoEquipos(minEq, maxEq)}</span>
                </h4>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={agregarIntegrante}
                  disabled={Boolean(maxEq) && filasIntegrantes.length >= maxEq}
                >
                  <Plus size={14} aria-hidden="true" /> Agregar integrante ({filasIntegrantes.length}{maxEq ? `/${maxEq}` : ''})
                </Button>
              </div>
              <p className="text-xs text-muted">
                Si el correo de un integrante pertenece a un miembro del club, su cuenta se vincula
                automáticamente. El primer integrante queda como capitán del equipo.
              </p>

              {filasIntegrantes.map((member, idx) => (
                <div key={idx} className="relative rounded-xl border border-line bg-surface-2 p-4">
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => quitarIntegrante(idx)}
                      aria-label={`Quitar integrante ${idx + 1}`}
                      className="absolute top-2 right-2 rounded p-1 text-danger hover:bg-surface"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                  <h4 className="mb-2 text-xs font-bold uppercase text-muted">
                    Integrante {idx + 1} {idx === 0 ? '(Capitán)' : ''}
                  </h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      label="Email"
                      type="email"
                      value={member.email}
                      onChange={(e) => setIntegrante(idx, 'email', e.target.value)}
                      required
                      placeholder="Correo personal o institucional"
                    />
                    <Input
                      label="Nombre"
                      value={member.nombre}
                      onChange={(e) => setIntegrante(idx, 'nombre', e.target.value)}
                      required
                    />
                    <Input
                      label="Teléfono"
                      value={member.telefono}
                      onChange={(e) => setIntegrante(idx, 'telefono', e.target.value.replace(/\D/g, '').slice(0, 15))}
                      required
                      placeholder="10 dígitos"
                    />
                    {/* Institución elegible (ITLAC → catálogo de carreras +
                        número de control; otra → escuela y carrera opcional).
                        Mismo bloque que el formulario público de equipos. */}
                    <CamposInstitucionIntegrante
                      data={member}
                      onPatch={(patch) => patchIntegrante(idx, patch)}
                    />
                    {solicitarTalla && (
                      <Select
                        label="Talla de playera"
                        value={member.talla_playera || ''}
                        onChange={(e) => setIntegrante(idx, 'talla_playera', e.target.value)}
                        options={TALLAS_PLAYERA}
                        placeholder="Selecciona la talla"
                        required
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Individual: mismo par de caminos que el formulario público
                (persona que ya existe en el sistema, o invitado nuevo con la
                ficha completa compartida). */}
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-2 p-1" role="tablist">
              {[
                { id: 'existente', label: 'Usuario existente' },
                { id: 'nuevo', label: 'Invitado nuevo' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={modo === tab.id}
                  onClick={() => setModo(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    modo === tab.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {modo === 'existente' ? (
              <div className="space-y-3">
                <Input
                  type="search"
                  placeholder="Buscar por nombre o correo…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  icon={<Search size={16} />}
                  aria-label="Buscar usuarios"
                />
                <div
                  role="listbox"
                  aria-label="Usuarios disponibles"
                  className="max-h-60 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface-2 scrollbar-thin"
                >
                  {!usersCatalog ? (
                    <p className="px-3 py-6 text-center text-sm text-muted">Cargando usuarios…</p>
                  ) : filtrados.visibles.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted">
                      {disponibles.length === 0
                        ? 'No queda nadie por inscribir: todos los usuarios del sistema ya están en la lista.'
                        : 'Sin coincidencias. Prueba con otro nombre o correo.'}
                    </p>
                  ) : (
                    filtrados.visibles.map((u) => {
                      const activo = seleccionado?.tipo === u.tipo && seleccionado?.id === u.id;
                      return (
                        <button
                          key={`${u.tipo}-${u.id}`}
                          type="button"
                          role="option"
                          aria-selected={activo}
                          onClick={() => setSeleccionado(u)}
                          className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                            activo ? 'bg-brand-soft' : 'hover:bg-surface'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-fg">{u.nombre_completo}</p>
                            <p className="truncate text-xs text-muted">{u.email}</p>
                          </div>
                          <Badge tone={u.tipo === 'miembro' ? 'success' : 'neutral'} size="sm">
                            {u.tipo}
                          </Badge>
                          {activo && <Check size={16} className="shrink-0 text-brand" aria-hidden="true" />}
                        </button>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-faint">
                  {filtrados.total > MAX_RESULTADOS
                    ? `Mostrando ${MAX_RESULTADOS} de ${filtrados.total} resultados: escribe para afinar la búsqueda.`
                    : 'Miembros e invitados que aún no están inscritos en este evento.'}
                </p>

                {solicitarTalla && (
                  <Select
                    label="Talla de playera"
                    value={talla}
                    onChange={(e) => setTalla(e.target.value)}
                    options={TALLAS_PLAYERA}
                    placeholder="Usar la talla guardada en su ficha"
                    help="Este evento entrega playera o kit. Obligatoria si la persona no tiene una talla registrada; la de un miembro sólo se guarda si aún no tenía."
                  />
                )}
              </div>
            ) : (
              <CamposInvitado
                data={invitado}
                errors={invitadoErrors}
                onChange={setInvitado}
                requiereTalla={solicitarTalla}
              />
            )}
          </>
        )}

        {/* Sólo tiene sentido con aforo limitado: sin cupo (NULL) nunca se llena. */}
        {evento?.cupos != null && (
          <label className="mt-5 flex cursor-pointer items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={forzar}
              onChange={(e) => setForzar(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-brand"
            />
            <span>Registrar aunque no queden cupos (el aforo del evento se ampliará para reflejarlo).</span>
          </label>
        )}
      </form>
    </Modal>
  );
}
