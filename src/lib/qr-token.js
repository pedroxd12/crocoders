// src/lib/qr-token.js
// Firma y verificación del ticket de acceso a eventos y programas.
// El token es `base64({ data: "<json>", sig: "<hmac-sha256 de data>" })`.
//
// Dos formas de payload, distinguibles por su campo de contexto:
//   evento:   { id: id_inscripcion,          eid: id_evento,   ts }
//   programa: { id: id_inscripcion_programa, pid: id_programa, ts }
// La firma es la misma; el verificador de cada contexto exige SU campo, así un
// ticket de programa no se puede colar en verify-qr de eventos ni al revés.
import crypto from 'crypto';

/** Firma un payload y devuelve el token en base64. */
export function firmarQrToken(payload, secret) {
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ data, sig })).toString('base64');
}

/**
 * Comprueba la firma (en tiempo constante) y devuelve el payload crudo, o null.
 * No valida la forma del payload: eso lo hace el verificador de cada contexto.
 */
function abrirQrToken(qrToken, secret) {
  try {
    if (typeof qrToken !== 'string' || qrToken.length > 4096) return null;

    const { data, sig } = JSON.parse(Buffer.from(qrToken, 'base64').toString('utf-8'));
    if (typeof data !== 'string' || typeof sig !== 'string') return null;

    const esperado = crypto.createHmac('sha256', secret).update(data).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const espBuf = Buffer.from(esperado, 'hex');
    if (sigBuf.length !== espBuf.length || !crypto.timingSafeEqual(sigBuf, espBuf)) return null;

    return JSON.parse(data);
  } catch {
    return null;
  }
}

/** Verifica un ticket de EVENTO y devuelve { id, eid, ts }, o null. */
export function verificarQrToken(qrToken, secret) {
  const payload = abrirQrToken(qrToken, secret);
  if (!payload) return null;

  const id = Number(payload.id);
  const eid = Number(payload.eid);
  const ts = Number(payload.ts);
  if (!Number.isInteger(id) || !Number.isInteger(eid) || !Number.isFinite(ts)) return null;

  return { id, eid, ts };
}

/** Verifica un ticket de PROGRAMA y devuelve { id, pid, ts }, o null. */
export function verificarQrTokenPrograma(qrToken, secret) {
  const payload = abrirQrToken(qrToken, secret);
  if (!payload) return null;

  const id = Number(payload.id);
  const pid = Number(payload.pid);
  const ts = Number(payload.ts);
  if (!Number.isInteger(id) || !Number.isInteger(pid) || !Number.isFinite(ts)) return null;

  return { id, pid, ts };
}
