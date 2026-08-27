// src/lib/qr-token.js
// Firma y verificación del ticket de acceso a eventos.
// El token es `base64({ data: "<json>", sig: "<hmac-sha256 de data>" })`.
import crypto from 'crypto';

/** Firma un payload y devuelve el token en base64. */
export function firmarQrToken(payload, secret) {
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ data, sig })).toString('base64');
}

/**
 * Verifica la firma y devuelve el payload, o null si el token es inválido.
 * La comparación de firmas es en tiempo constante.
 */
export function verificarQrToken(qrToken, secret) {
  try {
    if (typeof qrToken !== 'string' || qrToken.length > 4096) return null;

    const { data, sig } = JSON.parse(Buffer.from(qrToken, 'base64').toString('utf-8'));
    if (typeof data !== 'string' || typeof sig !== 'string') return null;

    const esperado = crypto.createHmac('sha256', secret).update(data).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const espBuf = Buffer.from(esperado, 'hex');
    if (sigBuf.length !== espBuf.length || !crypto.timingSafeEqual(sigBuf, espBuf)) return null;

    const payload = JSON.parse(data);
    const id = Number(payload.id);
    const eid = Number(payload.eid);
    const ts = Number(payload.ts);
    if (!Number.isInteger(id) || !Number.isInteger(eid) || !Number.isFinite(ts)) return null;

    return { id, eid, ts };
  } catch {
    return null;
  }
}
