// Prueba de posesión para el alta pública de invitados.
//
// POR QUÉ: el registro de un invitado a un evento recibía el `id_invitado`
// crudo en el cuerpo de la petición. Los ids son enteros secuenciales, así que
// cualquiera podía recorrer 1, 2, 3… e inscribir a personas reales a su nombre
// (consumiendo su cupo) y quedarse con el ticket QR firmado de esa inscripción.
//
// La solución es que /api/invitados devuelva, junto al id, un token firmado con
// HMAC que ata ese id a quien acaba de demostrar conocer el correo, y que el
// registro sólo acepte el id que venga dentro de ese token. No convierte el
// endpoint en privado —sigue siendo público a propósito, los invitados no
// tienen cuenta— pero sube el listón de "adivinar un número" a "conocer el
// correo", que es el mismo requisito que ya impone el alta.
//
// Formato: base64(JSON.stringify({ data, sig })), el mismo que el ticket QR,
// para no introducir un segundo formato de token en el proyecto.
import crypto from 'crypto';

// Ventana de vida: el token se emite y se consume en el mismo formulario, así
// que dos horas sobran incluso si el usuario se distrae rellenando los datos.
const MAX_EDAD_MS = 2 * 60 * 60 * 1000;

function secreto() {
  const s = process.env.PAYLOAD_SECRET;
  if (!s) throw new Error('PAYLOAD_SECRET no configurado');
  return s;
}

/**
 * Firma un id_invitado recién resuelto por correo.
 * @param {number} idInvitado
 * @returns {string} token opaco para el cliente
 */
export function firmarInvitado(idInvitado) {
  const data = JSON.stringify({ gid: Number(idInvitado), ts: Date.now() });
  const sig = crypto.createHmac('sha256', secreto()).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ data, sig })).toString('base64');
}

/**
 * Verifica el token y devuelve el id_invitado que contiene.
 * @param {string} token
 * @returns {{ ok: true, idInvitado: number } | { ok: false, error: string }}
 */
export function verificarInvitado(token) {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'Falta la credencial del invitado. Vuelve a completar tus datos.' };
  }

  let data;
  let sig;
  try {
    const decodificado = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    data = decodificado.data;
    sig = decodificado.sig;
    if (typeof data !== 'string' || typeof sig !== 'string') throw new Error('Estructura inválida');
  } catch {
    return { ok: false, error: 'Credencial de invitado inválida. Vuelve a completar tus datos.' };
  }

  // Comparación en tiempo constante para no filtrar la firma byte a byte.
  const esperado = crypto.createHmac('sha256', secreto()).update(data).digest('hex');
  const recibidoBuf = Buffer.from(sig, 'hex');
  const esperadoBuf = Buffer.from(esperado, 'hex');
  if (recibidoBuf.length !== esperadoBuf.length || !crypto.timingSafeEqual(recibidoBuf, esperadoBuf)) {
    return { ok: false, error: 'Credencial de invitado inválida. Vuelve a completar tus datos.' };
  }

  let cuerpo;
  try {
    cuerpo = JSON.parse(data);
  } catch {
    return { ok: false, error: 'Credencial de invitado inválida. Vuelve a completar tus datos.' };
  }

  const idInvitado = Number(cuerpo.gid);
  const ts = Number(cuerpo.ts);
  if (!Number.isInteger(idInvitado) || idInvitado <= 0 || !Number.isFinite(ts)) {
    return { ok: false, error: 'Credencial de invitado inválida. Vuelve a completar tus datos.' };
  }
  if (Date.now() - ts > MAX_EDAD_MS) {
    return { ok: false, error: 'La sesión del formulario caducó. Vuelve a completar tus datos.' };
  }

  return { ok: true, idInvitado };
}
