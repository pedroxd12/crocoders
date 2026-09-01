'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { ScanLine, Keyboard, CircleCheck, CircleX, CameraOff, Info } from 'lucide-react';
import { toast } from 'react-toastify';
import { formatearFechaHora } from '@/lib/fechas';

/**
 * Lector de códigos QR de asistencia.
 *
 * ANTES: el modal pedía permiso de cámara, mostraba el vídeo y, al pulsar
 * "Capturar QR", dibujaba el frame en un canvas que nadie leía y cambiaba al
 * modo manual con un toast ("Por favor usa el modo manual por ahora"). No había
 * ninguna librería de decodificación: se solicitaba la cámara del staff para
 * nada y el único camino real era transcribir a mano un token firmado larguísimo.
 *
 * AHORA: se decodifica con `BarcodeDetector`, la API del propio navegador (sin
 * añadir dependencias). Cuando el navegador no la implementa —Safari y Firefox,
 * y Chrome en Windows de escritorio— NO se pide la cámara: se explica por qué y
 * se ofrece el modo manual como respaldo declarado, no como un fallo silencioso.
 */
/**
 * Evento al que pertenece un ticket, leído del propio token.
 *
 * El token es `base64({ data: '{"id":…,"eid":…,"ts":…}', sig })`. Aquí sólo se
 * MIRA el campo `eid`, sin comprobar la firma: es una guarda de interfaz para
 * no marcar asistencia en el evento equivocado, no una verificación de
 * seguridad (esa la hace /api/eventos/verify-qr con el HMAC).
 */
function eventoDelTicket(qrCode) {
  try {
    const { data } = JSON.parse(atob(qrCode));
    const { eid } = JSON.parse(data);
    return eid == null ? null : Number(eid);
  } catch {
    return null;
  }
}

export default function QRScannerModal({ isOpen, onClose, onSuccess, eventoId }) {
  const [modo, setModo] = useState('camara'); // 'camara' | 'manual'
  const [soporteCamara, setSoporteCamara] = useState(null); // null = comprobando
  const [motivoSinCamara, setMotivoSinCamara] = useState(null);
  const [escaneando, setEscaneando] = useState(false);
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [manualCode, setManualCode] = useState('');

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
      // El escáner se abre desde la pantalla de UN evento. Si el ticket es de
      // otro, se corta aquí: antes se enviaba igual y el servidor —que saca el
      // evento del propio token— respondía "Asistencia registrada", marcando la
      // asistencia en el evento equivocado sin que nadie se enterara.
      const eventoTicket = eventoDelTicket(qrCode);
      if (eventoId != null && eventoTicket != null && eventoTicket !== Number(eventoId)) {
        const mensaje = 'Este ticket pertenece a otro evento.';
        setResult({ success: false, message: mensaje });
        toast.error(mensaje);
        return;
      }

      setProcessing(true);
      try {
        const res = await fetch('/api/eventos/verify-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // `eventoId` viaja para que el servidor pueda imponer la misma regla
          // (hoy la ignora: ver notas de revisión).
          body: JSON.stringify({ qrToken: qrCode, eventoId: eventoId ?? undefined }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          setResult({ success: false, message: data.error || 'Código no válido' });
          toast.error(data.error || 'Código no válido');
          return;
        }

        setResult({
          success: true,
          alreadyRegistered: data.alreadyRegistered,
          message: data.message,
          data: data.data,
        });

        if (!data.alreadyRegistered) {
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
    [onSuccess, eventoId],
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

  const handleClose = () => {
    detenerCamara();
    setResult(null);
    setManualCode('');
    setModo(soporteCamara ? 'camara' : 'manual');
    onClose();
  };

  const handleNewScan = () => {
    setResult(null);
    setManualCode('');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Registrar asistencia por QR" size="lg">
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
                <label htmlFor="codigo-ticket" className="block text-sm font-medium text-muted">
                  Código del ticket
                </label>
                <textarea
                  id="codigo-ticket"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Pega aquí el código del ticket QR…"
                  rows={5}
                  className="w-full resize-none rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs text-fg placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                  disabled={processing}
                />
                <p className="flex items-start gap-2 text-xs text-faint">
                  <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  Es el texto largo que aparece bajo el código en el correo de confirmación.
                </p>
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
          <div className="py-4 text-center">
            <div
              className={`mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full ${
                result.success ? 'bg-brand-soft text-brand' : 'bg-danger-soft text-danger'
              }`}
            >
              {result.success ? <CircleCheck size={36} /> : <CircleX size={36} />}
            </div>

            <h3 className={`text-lg font-semibold ${result.success ? 'text-brand' : 'text-danger'}`}>
              {result.message}
            </h3>

            {result.success && result.data && (
              <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4 text-left">
                <p className="font-medium text-fg">{result.data.nombre}</p>
                <p className="text-sm text-muted">{result.data.correo}</p>
                <p className="mt-2 text-sm text-muted">{result.data.evento}</p>
                {result.alreadyRegistered && result.data.fecha_registro && (
                  <p className="mt-2 text-xs text-warning">
                    Ya se había registrado el {formatearFechaHora(result.data.fecha_registro)}
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <Button onClick={handleNewScan} variant="secondary" className="flex-1">
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
