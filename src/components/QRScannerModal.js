'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { ScanLine, Keyboard, CircleCheck, CircleX, CameraOff, Check, ClipboardPaste, MapPin } from 'lucide-react';
import { toast } from 'react-toastify';
import { formatearFechaHora } from '@/lib/fechas';

/**
 * Hora corta ("06:23 p.m.") de un TIMESTAMP (hora_asistencia,
 * hora_entrega_playera). No sirve `formatearHora` de lib/fechas: esa espera
 * cadenas "HH:MM" de columnas TIME y con un timestamp imprime cualquier cosa.
 */
function horaDeTimestamp(valor, respaldo = '—') {
  if (!valor) return respaldo;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return respaldo;
  return fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Lector de códigos QR de asistencia.
 *
 * Se decodifica con `BarcodeDetector`, la API del propio navegador (sin añadir
 * dependencias). Cuando el navegador no la implementa —Safari y Firefox, y
 * Chrome en Windows de escritorio— NO se pide la cámara: se explica por qué y
 * se ofrece el modo manual como respaldo declarado, no como un fallo silencioso.
 *
 * El resultado del escaneo ya no es sólo "asistencia registrada": el servidor
 * devuelve la ficha de check-in y aquí se atiende la puerta completa:
 * - Individual: primera lectura marca la asistencia; si el evento entrega
 *   playera se muestra la talla y un botón para registrar la entrega.
 * - Equipo: el QR (uno por equipo, lo trae el capitán) NO marca a nadie; se
 *   muestra el roster —integrantes y asesores— y el staff marca llegada y
 *   playera persona por persona vía /api/eventos/checkin.
 */
/**
 * Contexto al que pertenece un ticket, leído del propio token.
 *
 * El token es `base64({ data: '{"id":…,"eid"|"pid":…,"ts":…}', sig })` — `eid`
 * en tickets de evento, `pid` en tickets de programa. Aquí sólo se MIRAN esos
 * campos, sin comprobar la firma: es una guarda de interfaz para no marcar
 * asistencia en el lugar equivocado, no una verificación de seguridad (esa la
 * hacen /api/eventos/verify-qr y /api/programas/verify-qr con el HMAC).
 */
function contextoDelTicket(qrCode) {
  try {
    const { data } = JSON.parse(atob(qrCode));
    const { eid, pid } = JSON.parse(data);
    return {
      eid: eid == null ? null : Number(eid),
      pid: pid == null ? null : Number(pid),
    };
  } catch {
    return { eid: null, pid: null };
  }
}

/** Chip de talla: el dato que el staff necesita LEER para tomar la playera. */
function ChipTalla({ talla }) {
  return (
    <span
      title={talla ? `Talla ${talla}` : 'Sin talla registrada'}
      className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border px-1.5 text-xs font-semibold ${
        talla ? 'border-line bg-surface-2 text-fg' : 'border-dashed border-line text-faint'
      }`}
    >
      {talla || '—'}
    </span>
  );
}

/** Botón-toggle de una marca (llegada / playera) sobre una persona del roster. */
function BotonMarca({ activo, pendiente, onClick, etiqueta, etiquetaActiva }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pendiente}
      aria-pressed={activo}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-60 ${
        activo
          ? 'border-brand/30 bg-brand-soft text-brand'
          : 'border-line bg-surface-2 text-muted hover:text-fg'
      }`}
    >
      {activo && <Check size={13} aria-hidden="true" />}
      {activo ? etiquetaActiva : etiqueta}
    </button>
  );
}

/**
 * `eventoId` — modo evento (el de siempre): verify-qr/checkin de eventos.
 * `programa` — modo programa: `{ id, sesionId }`. El mismo ticket vale todo el
 * programa; el escaneo marca la asistencia de ESA sesión y la playera se
 * entrega una sola vez por participante.
 */
export default function QRScannerModal({ isOpen, onClose, onSuccess, onUpdate, eventoId, programa }) {
  // Escalares y no el objeto `programa`: los padres lo pasan inline (identidad
  // nueva por render) y meterlo en las deps de los callbacks reiniciaría el
  // bucle de la cámara en cada render (misma lección que Modal.js y onClose).
  const programaId = programa?.id;
  const sesionId = programa?.sesionId;
  const esPrograma = Boolean(programaId && sesionId);
  const [modo, setModo] = useState('camara'); // 'camara' | 'manual'
  const [soporteCamara, setSoporteCamara] = useState(null); // null = comprobando
  const [motivoSinCamara, setMotivoSinCamara] = useState(null);
  const [escaneando, setEscaneando] = useState(false);
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [manualCode, setManualCode] = useState('');
  // Token ya verificado: ancla de los toggles de check-in del resultado.
  const [tokenVerificado, setTokenVerificado] = useState(null);
  const [pendientes, setPendientes] = useState(() => new Set());

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const detenerCamara = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setEscaneando(false);
  }, []);

  const verifyQR = useCallback(
    async (qrCode) => {
      // El escáner se abre desde la pantalla de UN evento (o de UNA sesión de
      // UN programa). Si el ticket es de otro sitio, se corta aquí (y el
      // servidor repite la misma guarda con `eventoId` / `programaId`).
      const ticket = contextoDelTicket(qrCode);
      if (esPrograma) {
        if (ticket.eid != null || (ticket.pid != null && ticket.pid !== Number(programaId))) {
          const mensaje = ticket.eid != null
            ? 'Este ticket es de un evento, no de este programa.'
            : 'Este ticket pertenece a otro programa.';
          setResult({ success: false, message: mensaje });
          toast.error(mensaje);
          return;
        }
      } else if (eventoId != null && (ticket.pid != null || (ticket.eid != null && ticket.eid !== Number(eventoId)))) {
        const mensaje = ticket.pid != null
          ? 'Este ticket es de un programa, no de este evento.'
          : 'Este ticket pertenece a otro evento.';
        setResult({ success: false, message: mensaje });
        toast.error(mensaje);
        return;
      }

      setProcessing(true);
      try {
        const res = await fetch(esPrograma ? '/api/programas/verify-qr' : '/api/eventos/verify-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            esPrograma
              ? { qrToken: qrCode, programaId, sesionId }
              : { qrToken: qrCode, eventoId: eventoId ?? undefined },
          ),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          setResult({ success: false, message: data.error || 'Código no válido' });
          toast.error(data.error || 'Código no válido');
          return;
        }

        setTokenVerificado(qrCode);
        setResult({
          success: true,
          alreadyRegistered: data.alreadyRegistered,
          message: data.message,
          data: data.data,
        });

        if (data.data?.tipo === 'equipo') {
          // Un equipo no queda marcado por el escaneo: se marca persona por
          // persona en el roster que acaba de aparecer.
          toast.info('Equipo verificado: marca la llegada de cada integrante');
        } else if (!data.alreadyRegistered) {
          toast.success('¡Asistencia registrada!');
          onSuccess?.(data.data);
        } else {
          toast.info('La asistencia ya estaba registrada');
        }
      } catch (error) {
        console.error('Error al verificar el QR:', error);
        setResult({ success: false, message: 'No se pudo procesar la solicitud' });
        toast.error('No se pudo procesar la solicitud');
      } finally {
        setProcessing(false);
      }
    },
    [onSuccess, eventoId, esPrograma, programaId, sesionId],
  );

  /**
   * Marca o desmarca asistencia/playera de una persona del resultado actual y
   * refleja el cambio en el estado local (sin re-escanear).
   */
  const aplicarCheckin = useCallback(
    async (objetivo, campo, valor) => {
      if (!tokenVerificado) return;
      const clave = `${objetivo.tipo}-${objetivo.id ?? 0}-${campo}`;
      setPendientes((prev) => new Set(prev).add(clave));
      try {
        const res = await fetch(esPrograma ? '/api/programas/checkin' : '/api/eventos/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            esPrograma
              // En programas no hay equipos: el objetivo es siempre la propia
              // inscripción, y la asistencia va contra la sesión abierta.
              ? { qrToken: tokenVerificado, campo, valor, sesionId }
              : { qrToken: tokenVerificado, objetivo, campo, valor },
          ),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo aplicar el cambio');

        const hora = data.data?.hora ?? null;
        const cambios = campo === 'asistencia'
          ? { asistio: valor, hora_asistencia: hora }
          : { playera_entregada: valor, hora_entrega_playera: hora };

        setResult((prev) => {
          if (!prev?.data) return prev;
          if (objetivo.tipo === 'inscripcion') {
            const enInscripcion = campo === 'asistencia'
              ? { asistio: valor, fecha_registro: hora }
              : cambios;
            return { ...prev, data: { ...prev.data, ...enInscripcion } };
          }
          const listaKey = objetivo.tipo === 'integrante' ? 'integrantes' : 'asesores';
          const idKey = objetivo.tipo === 'integrante' ? 'id_integrante' : 'id_asesor';
          const equipo = prev.data.equipo ?? {};
          return {
            ...prev,
            data: {
              ...prev.data,
              equipo: {
                ...equipo,
                [listaKey]: (equipo[listaKey] ?? []).map((p) =>
                  p[idKey] === objetivo.id ? { ...p, ...cambios } : p,
                ),
              },
            },
          };
        });
        onUpdate?.();
      } catch (error) {
        toast.error(error.message);
      } finally {
        setPendientes((prev) => {
          const s = new Set(prev);
          s.delete(clave);
          return s;
        });
      }
    },
    [tokenVerificado, onUpdate, esPrograma, sesionId],
  );

  // 1) ¿Sabe este navegador leer códigos QR? Se comprueba ANTES de pedir la
  //    cámara, para no reclamar un permiso que no vamos a poder aprovechar.
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelado = false;

    (async () => {
      if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
        if (cancelado) return;
        setSoporteCamara(false);
        setMotivoSinCamara('Este navegador no puede leer códigos QR desde la cámara.');
        setModo('manual');
        return;
      }
      try {
        const formatos = await window.BarcodeDetector.getSupportedFormats();
        if (cancelado) return;
        if (!formatos.includes('qr_code')) {
          setSoporteCamara(false);
          setMotivoSinCamara('Este navegador no reconoce el formato QR.');
          setModo('manual');
          return;
        }
        setSoporteCamara(true);
      } catch {
        if (cancelado) return;
        setSoporteCamara(false);
        setMotivoSinCamara('No se pudo inicializar el lector de códigos.');
        setModo('manual');
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [isOpen]);

  // 2) Cámara + bucle de detección.
  useEffect(() => {
    if (!isOpen || modo !== 'camara' || soporteCamara !== true || result) return undefined;

    let activo = true;
    let detector;

    const bucle = async () => {
      if (!activo) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const codigos = await detector.detect(video);
          const valor = codigos?.[0]?.rawValue;
          if (valor && activo) {
            detenerCamara();
            verifyQR(valor);
            return;
          }
        } catch {
          // Un frame ilegible no es un error: se reintenta en el siguiente.
        }
      }
      if (activo) rafRef.current = requestAnimationFrame(bucle);
    };

    (async () => {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (!activo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setEscaneando(true);
        rafRef.current = requestAnimationFrame(bucle);
      } catch (error) {
        console.error('Error al acceder a la cámara:', error);
        if (!activo) return;
        setSoporteCamara(false);
        setMotivoSinCamara('No se pudo acceder a la cámara (permiso denegado o en uso por otra app).');
        setModo('manual');
      }
    })();

    return () => {
      activo = false;
      detenerCamara();
    };
  }, [isOpen, modo, soporteCamara, result, detenerCamara, verifyQR]);

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      toast.warning('Pega el código del ticket');
      return;
    }
    await verifyQR(manualCode.trim());
  };

  // Pegar es el gesto natural con un token tan largo: al pegar (Ctrl+V o el
  // botón) se verifica de inmediato, sin pasar por "Verificar código".
  const handlePaste = (e) => {
    const texto = e.clipboardData?.getData('text')?.trim();
    if (!texto || processing) return;
    e.preventDefault();
    setManualCode(texto);
    verifyQR(texto);
  };

  const pegarDelPortapapeles = async () => {
    try {
      const texto = (await navigator.clipboard.readText())?.trim();
      if (!texto) {
        toast.warning('El portapapeles está vacío');
        return;
      }
      setManualCode(texto);
      verifyQR(texto);
    } catch {
      toast.error('No se pudo leer el portapapeles; pega el código con Ctrl+V.');
    }
  };

  const limpiarResultado = () => {
    setResult(null);
    setManualCode('');
    setTokenVerificado(null);
    setPendientes(new Set());
  };

  const handleClose = () => {
    detenerCamara();
    limpiarResultado();
    setModo(soporteCamara ? 'camara' : 'manual');
    onClose();
  };

  const datos = result?.data;
  const esEquipo = datos?.tipo === 'equipo';
  // "Sesión 3 · Introducción a Git" — lo que identifica la lista que se pasa.
  const etiquetaSesion = datos?.sesion
    ? [
        datos.sesion.numero != null ? `Sesión ${datos.sesion.numero}` : null,
        datos.sesion.titulo,
      ].filter(Boolean).join(' · ')
    : null;
  const conPlayera = Boolean(datos?.solicitar_talla);
  const integrantes = datos?.equipo?.integrantes ?? [];
  const asesores = datos?.equipo?.asesores ?? [];
  const llegaron = integrantes.filter((p) => p.asistio).length;
  const playerasEntregadas =
    integrantes.filter((p) => p.playera_entregada).length +
    asesores.filter((a) => a.playera_entregada).length;

  /** Fila del roster de equipo: integrante o asesor. */
  const filaPersona = (persona, tipoObjetivo) => {
    const esIntegrante = tipoObjetivo === 'integrante';
    const id = esIntegrante ? persona.id_integrante : persona.id_asesor;
    const claveBase = `${tipoObjetivo}-${id}`;
    return (
      <li key={claveBase} className="flex items-center gap-2 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">
            {persona.nombre}
            {esIntegrante && persona.es_capitan && (
              <span className="ml-1.5 align-middle text-[11px] font-medium text-brand">Capitán</span>
            )}
            {!esIntegrante && (
              <span className="ml-1.5 align-middle text-[11px] font-medium text-info">Asesor</span>
            )}
          </p>
          {persona.asistio && persona.hora_asistencia ? (
            <p className="text-[11px] text-faint">Llegó a las {horaDeTimestamp(persona.hora_asistencia)}</p>
          ) : (
            persona.correo && <p className="truncate text-[11px] text-faint">{persona.correo}</p>
          )}
        </div>
        {conPlayera && <ChipTalla talla={persona.talla_playera} />}
        <BotonMarca
          activo={Boolean(persona.asistio)}
          pendiente={pendientes.has(`${claveBase}-asistencia`)}
          onClick={() => aplicarCheckin({ tipo: tipoObjetivo, id }, 'asistencia', !persona.asistio)}
          etiqueta="Llegó"
          etiquetaActiva="Presente"
        />
        {conPlayera && (
          <BotonMarca
            activo={Boolean(persona.playera_entregada)}
            pendiente={pendientes.has(`${claveBase}-playera`)}
            onClick={() => aplicarCheckin({ tipo: tipoObjetivo, id }, 'playera', !persona.playera_entregada)}
            etiqueta="Playera"
            etiquetaActiva="Playera"
          />
        )}
      </li>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={esPrograma ? 'Pasar lista por QR' : 'Registrar asistencia por QR'}
      size="lg"
    >
      <div className="space-y-4">
        {!result ? (
          <>
            <div className="flex justify-center gap-2">
              <Button
                onClick={() => setModo('camara')}
                variant={modo === 'camara' ? 'primary' : 'secondary'}
                size="sm"
                disabled={soporteCamara === false}
                title={soporteCamara === false ? motivoSinCamara ?? undefined : undefined}
              >
                <ScanLine size={16} aria-hidden="true" /> Cámara
              </Button>
              <Button
                onClick={() => {
                  detenerCamara();
                  setModo('manual');
                }}
                variant={modo === 'manual' ? 'primary' : 'secondary'}
                size="sm"
              >
                <Keyboard size={16} aria-hidden="true" /> Código manual
              </Button>
            </div>

            {soporteCamara === false && (
              <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                <CameraOff size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Lectura por cámara no disponible</p>
                  <p className="mt-0.5 text-muted">
                    {motivoSinCamara} Usa el código manual: pídele al asistente que copie el texto de
                    su ticket, o ábrelo desde otro navegador basado en Chrome.
                  </p>
                </div>
              </div>
            )}

            {modo === 'camara' && soporteCamara !== false ? (
              <div className="relative overflow-hidden rounded-xl border border-line bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="h-64 w-full object-cover" />

                {/* Mirilla: sitúa el QR en el centro del encuadre. */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-40 w-40 rounded-xl border-2 border-brand/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>

                <div className="absolute inset-x-0 bottom-3 flex justify-center">
                  <Badge tone={escaneando ? 'success' : 'neutral'}>
                    {processing
                      ? 'Verificando…'
                      : escaneando
                        ? 'Buscando código…'
                        : 'Iniciando cámara…'}
                  </Badge>
                </div>
              </div>
            ) : (
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div>
                  <label htmlFor="codigo-ticket" className="mb-1.5 block text-sm font-medium text-muted">
                    Código del ticket
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="codigo-ticket"
                      type="text"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      onPaste={handlePaste}
                      placeholder="Pega el código aquí"
                      autoComplete="off"
                      spellCheck={false}
                      className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 font-mono text-xs text-fg placeholder:font-sans placeholder:text-sm placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                      disabled={processing}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={pegarDelPortapapeles}
                      disabled={processing}
                      title="Pegar el código desde el portapapeles"
                    >
                      <ClipboardPaste size={16} aria-hidden="true" /> Pegar
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-faint">
                    Es el texto largo que aparece bajo el código QR en el correo de confirmación.
                    Al pegarlo se verifica automáticamente.
                  </p>
                </div>
                <Button type="submit" className="w-full" loading={processing} disabled={!manualCode.trim()}>
                  Verificar código
                </Button>
              </form>
            )}

            {modo === 'camara' && soporteCamara !== false && (
              <p className="text-center text-xs text-faint">
                El código se lee solo al enfocarlo. Si la luz no acompaña, usa el código manual.
              </p>
            )}
          </>
        ) : (
          <div className="py-2">
            <div className="text-center">
              <div
                className={`mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full ${
                  result.success ? 'bg-brand-soft text-brand' : 'bg-danger-soft text-danger'
                }`}
              >
                {result.success ? <CircleCheck size={32} /> : <CircleX size={32} />}
              </div>
              <h3 className={`text-lg font-semibold ${result.success ? 'text-brand' : 'text-danger'}`}>
                {result.message}
              </h3>
            </div>

            {result.success && datos && !esEquipo && (
              <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
                <p className="font-medium text-fg">{datos.nombre}</p>
                <p className="text-sm text-muted">{datos.correo}</p>
                <p className="mt-1 text-sm text-muted">
                  {esPrograma ? datos.programa : datos.evento}
                  {esPrograma && etiquetaSesion ? ` · ${etiquetaSesion}` : ''}
                </p>
                {datos.mesa && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-info/30 bg-info-soft px-2 py-1 text-sm font-semibold text-info">
                    <MapPin size={14} aria-hidden="true" /> {datos.mesa}
                  </p>
                )}
                {result.alreadyRegistered && datos.fecha_registro && (
                  <p className="mt-2 text-xs text-warning">
                    Ya se había registrado el {formatearFechaHora(datos.fecha_registro)}
                  </p>
                )}

                {/* En programas la lista se pasa sesión a sesión, así que el
                    staff necesita poder deshacer un escaneo equivocado sin
                    salir a la tabla. En eventos ese toggle vive en el panel. */}
                {esPrograma && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
                    <div>
                      <p className="text-xs text-faint">Asistencia de esta sesión</p>
                      <p className="text-sm font-semibold text-fg">
                        {datos.asistio === false ? 'Sin registrar' : 'Registrada'}
                      </p>
                    </div>
                    <BotonMarca
                      activo={datos.asistio !== false}
                      pendiente={pendientes.has('inscripcion-0-asistencia')}
                      onClick={() =>
                        aplicarCheckin({ tipo: 'inscripcion' }, 'asistencia', datos.asistio === false)
                      }
                      etiqueta="Marcar llegada"
                      etiquetaActiva="Presente"
                    />
                  </div>
                )}

                {/* Entrega de playera: sólo si el evento/programa la pide. La
                    talla va grande porque es lo que el staff lee para tomarla. */}
                {conPlayera && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
                    <div>
                      <p className="text-xs text-faint">Playera</p>
                      <p className="text-sm font-semibold text-fg">
                        {datos.talla_playera ? `Talla ${datos.talla_playera}` : 'Sin talla registrada'}
                      </p>
                      {datos.playera_entregada && datos.hora_entrega_playera && (
                        <p className="mt-0.5 text-[11px] text-faint">
                          Entregada a las {horaDeTimestamp(datos.hora_entrega_playera)}
                        </p>
                      )}
                    </div>
                    <BotonMarca
                      activo={Boolean(datos.playera_entregada)}
                      pendiente={pendientes.has('inscripcion-0-playera')}
                      onClick={() =>
                        aplicarCheckin({ tipo: 'inscripcion' }, 'playera', !datos.playera_entregada)
                      }
                      etiqueta="Entregar playera"
                      etiquetaActiva="Entregada"
                    />
                  </div>
                )}
              </div>
            )}

            {result.success && datos && esEquipo && (
              <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-medium text-fg">{datos.nombre}</p>
                  <p className="text-xs text-muted">
                    {llegaron} de {integrantes.length} integrantes presentes
                    {conPlayera ? ` · ${playerasEntregadas} playera(s) entregada(s)` : ''}
                  </p>
                </div>
                <p className="mt-0.5 text-sm text-muted">{datos.evento}</p>
                {datos.mesa && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-info/30 bg-info-soft px-2 py-1 text-sm font-semibold text-info">
                    <MapPin size={14} aria-hidden="true" /> {datos.mesa}
                  </p>
                )}

                <ul className="mt-3 divide-y divide-line border-t border-line">
                  {integrantes.map((p) => filaPersona(p, 'integrante'))}
                  {asesores.map((a) => filaPersona(a, 'asesor'))}
                </ul>

                {conPlayera && (
                  <p className="mt-2 text-[11px] text-faint">
                    La talla es la que registró cada persona al inscribirse; “—” significa que no la dio.
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <Button onClick={limpiarResultado} variant="secondary" className="flex-1">
                Escanear otro
              </Button>
              <Button onClick={handleClose} className="flex-1">
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
