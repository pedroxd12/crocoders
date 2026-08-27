import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import {
  sendMail,
  escapeHtml,
  escapeHtmlMultiline,
  sanitizeHeader,
  institutionalFrom,
  isSingleEmailAddress,
  mailIsConfigured,
} from '@/lib/mailer';

export async function POST(request) {
  // Rate limit: este endpoint público envía correo; sin límite es un relay de spam.
  const rl = rateLimit(request, { scope: 'contact', limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiados mensajes enviados. Intenta de nuevo más tarde.' },
      { status: 429 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo no es JSON válido' }, { status: 400 });
  }
  const name = String(body?.name ?? '').trim();
  const email = String(body?.email ?? '').trim();
  const subject = String(body?.subject ?? '').trim();
  const message = String(body?.message ?? '').trim();

  // Validación básica
  if (!name || !email || !subject || !message) {
    return NextResponse.json(
      { success: false, error: 'Todos los campos son requeridos' },
      { status: 400 }
    );
  }
  // Una sola dirección y nada más: sin comas, ni "<>", ni saltos de línea. Ese
  // valor va al Reply-To, así que aceptar una lista permitiría inyectar
  // destinatarios extra en la cabecera.
  if (!isSingleEmailAddress(email)) {
    return NextResponse.json({ success: false, error: 'Correo electrónico no válido' }, { status: 400 });
  }
  if (name.length > 120 || subject.length > 200 || message.length > 5000) {
    return NextResponse.json(
      { success: false, error: 'Alguno de los campos excede la longitud permitida.' },
      { status: 400 },
    );
  }

  if (!mailIsConfigured()) {
    console.error('[contact] EMAIL_USER / EMAIL_PASSWORD no configurados');
    return NextResponse.json(
      { success: false, error: 'Error al enviar el mensaje. Por favor, inténtalo de nuevo más tarde.' },
      { status: 500 },
    );
  }

  try {
    // Todo lo que escribe el visitante se escapa antes de entrar al HTML: si no,
    // el correo que llega al buzón del club puede traer marcado o enlaces
    // fabricados por quien rellenó el formulario.
    const nombreSeguro = escapeHtml(name);
    const emailSeguro = escapeHtml(email);
    const asuntoSeguro = escapeHtml(subject);
    const mensajeSeguro = escapeHtmlMultiline(message);

    await sendMail({
      // El remitente es SIEMPRE la cuenta del club (si no, Gmail rechaza el
      // envío o lo marca como suplantación). La dirección del visitante va en
      // Reply-To, que es lo que permite responderle.
      from: institutionalFrom(),
      to: process.env.EMAIL_USER,
      replyTo: email,
      subject: `Nuevo mensaje de contacto: ${sanitizeHeader(subject)}`,
      text: `Nombre: ${name}\nEmail: ${email}\n\nMensaje:\n${message}`,
      html: `
        <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px;">
          <h1 style="color: #333; border-bottom: 2px solid #1ef184; padding-bottom: 10px;">Nuevo mensaje de contacto</h1>
          <p><strong>Asunto:</strong> ${asuntoSeguro}</p>
          <p><strong>Nombre:</strong> ${nombreSeguro}</p>
          <p><strong>Email:</strong> ${emailSeguro}</p>
          <h3 style="color: #333; margin-top: 20px;">Mensaje:</h3>
          <div style="background-color: white; padding: 15px; border-radius: 5px; border-left: 4px solid #1ef184;">
            ${mensajeSeguro}
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #777;">
            Este mensaje fue enviado desde el formulario de contacto de Crocoders.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[contact] Error al enviar el correo:', error.message);
    return NextResponse.json(
      { success: false, error: 'Error al enviar el mensaje. Por favor, inténtalo de nuevo más tarde.' },
      { status: 500 }
    );
  }
}
