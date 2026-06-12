import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { rateLimit } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ success: false, error: 'Correo electrónico no válido' }, { status: 400 });
  }
  if (name.length > 120 || subject.length > 200 || message.length > 5000) {
    return NextResponse.json(
      { success: false, error: 'Alguno de los campos excede la longitud permitida.' },
      { status: 400 },
    );
  }

  try {
    // Configurar el transporter de nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Configurar el email
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_USER,
      replyTo: email,
      subject: `Nuevo mensaje de contacto: ${subject}`,
      text: `Nombre: ${name}\nEmail: ${email}\n\nMensaje:\n${message}`,
      html: `
        <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px;">
          <h1 style="color: #333; border-bottom: 2px solid #1ef184; padding-bottom: 10px;">Nuevo mensaje de contacto</h1>
          <p><strong>Asunto:</strong> ${subject}</p>
          <p><strong>Nombre:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <h3 style="color: #333; margin-top: 20px;">Mensaje:</h3>
          <div style="background-color: white; padding: 15px; border-radius: 5px; border-left: 4px solid #1ef184;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #777;">
            Este mensaje fue enviado desde el formulario de contacto de Crocoders.
          </p>
        </div>
      `,
    };

    // Enviar el email
    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { success: false, error: 'Error al enviar el mensaje. Por favor, inténtalo de nuevo más tarde.' },
      { status: 500 }
    );
  }
}