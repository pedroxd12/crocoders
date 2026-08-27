// src/lib/mailer.js
// Punto ÚNICO de salida de correo. Antes cada endpoint creaba su propio
// transporter (uno de ellos con `rejectUnauthorized: false`, es decir sin
// validar el certificado TLS de Gmail) e interpolaba texto del usuario
// directamente en el HTML y en las cabeceras del mensaje.
//
// Aquí se centraliza:
//   - un transporter reutilizado (menos handshakes TLS por request),
//   - validación estricta del certificado del servidor SMTP,
//   - escapado de HTML para todo lo que venga del usuario,
//   - saneado de cabeceras (CRLF) para evitar inyección de headers SMTP.
import nodemailer from 'nodemailer';

let cachedTransporter = null;

/** ¿Están configuradas las credenciales de correo? */
export function mailIsConfigured() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
}

/**
 * Transporter compartido. Se crea una sola vez por instancia; nodemailer
 * mantiene el pool interno y reusa la conexión.
 */
export function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  if (!mailIsConfigured()) {
    throw new Error('EMAIL_USER / EMAIL_PASSWORD no configurados');
  }

  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    // El certificado de smtp.gmail.com es válido: NO se desactiva la
    // verificación. Con rejectUnauthorized:false cualquiera que pueda
    // interponerse en la red lee las credenciales SMTP y el contenido.
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
  });

  return cachedTransporter;
}

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapa texto antes de interpolarlo en el HTML de un correo.
 * Sin esto, un nombre como `<img src=x onerror=...>` viaja como marcado real
 * al buzón de quien lo recibe (phishing dentro de un correo "legítimo").
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Igual que escapeHtml pero conserva los saltos de línea como <br>. */
export function escapeHtmlMultiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

/**
 * Sanea un valor que va a una cabecera del mensaje (Subject, nombre en From…).
 * Elimina CR/LF y caracteres de control: son el vector clásico de inyección de
 * cabeceras SMTP (añadir Bcc:, reescribir From:, partir el mensaje…).
 */
export function sanitizeHeader(value, maxLength = 200) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\r\n\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

// Un correo debe ser una sola dirección simple: nada de listas separadas por
// comas ni de "Nombre <dir>" construido por el cliente.
const SINGLE_ADDRESS_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** Valida que `value` sea UNA dirección de correo y nada más. */
export function isSingleEmailAddress(value) {
  return typeof value === 'string' && value.length <= 254 && SINGLE_ADDRESS_RE.test(value);
}

/** Remitente institucional. Nunca se toma del input del usuario. */
export function institutionalFrom() {
  const address = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  return { name: 'Club Crocoders', address };
}

/**
 * Envía un correo con un timeout duro para no dejar la función serverless
 * colgada si el SMTP no responde.
 */
export async function sendMail(options, { timeoutMs = 20000 } = {}) {
  const transporter = getTransporter();
  const send = transporter.sendMail({
    ...options,
    subject: sanitizeHeader(options.subject, 250),
  });
  return Promise.race([
    send,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP timeout')), timeoutMs),
    ),
  ]);
}
