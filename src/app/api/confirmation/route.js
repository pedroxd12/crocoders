// api/confirmation/route.js
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request) {
  try {
    const data = await request.json();

    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Solicitud inválida' },
        { status: 200 }
      );
    }

    const { email, name, eventDetails } = data;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Datos inválidos' },
        { status: 200 }
      );
    }

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Datos inválidos' },
        { status: 200 }
      );
    }

    if (
      !eventDetails || typeof eventDetails !== 'object' ||
      !eventDetails.nombre_evento || !eventDetails.fecha
    ) {
      return NextResponse.json(
        { success: false, error: 'Datos inválidos' },
        { status: 200 }
      );
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    try {
      await transporter.verify();
    } catch (_) {
      return NextResponse.json(
        { success: false, error: 'No se pudo enviar el correo' },
        { status: 200 }
      );
    }

    let formattedDate = eventDetails.fecha;
    try {
      const date = new Date(eventDetails.fecha);
      if (!isNaN(date.getTime())) {
        formattedDate = date.toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }
    } catch (_) {}

    const mailOptions = {
      from: `"Club Crocoders" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Confirmación de registro: ${eventDetails.nombre_evento}`,
      html: `
        <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
            <h1 style="color: #1ef184; margin: 0;">Club Crocoders</h1>
          </div>
          <div style="padding: 25px; background-color: #f9f9f9; border-radius: 0 0 8px 8px; border: 1px solid #e1e1e1;">
            <h2 style="color: #1a1a1a; margin-top: 0;">¡Hola ${name}!</h2>
            <p>Tu registro para el evento <strong>${eventDetails.nombre_evento}</strong> ha sido exitoso.</p>
            <div style="background-color: white; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e1e1e1;">
              <h3 style="margin-top: 0; color: #1a1a1a;">Detalles del evento:</h3>
              <p><strong>Fecha:</strong> ${formattedDate}</p>
              <p><strong>Hora:</strong> ${eventDetails.hora_inicio || '--:--'} - ${eventDetails.hora_fin || '--:--'}</p>
              ${eventDetails.costo > 0 ? `<p><strong>Costo:</strong> $${Number(eventDetails.costo).toFixed(2)}</p>` : ''}
            </div>
            <p style="font-size: 14px; color: #666;">Recibirás un recordatorio un día antes del evento.</p>
            <p style="font-size: 14px; color: #666;">Si tienes alguna pregunta, contáctanos respondiendo a este correo.</p>
          </div>
          <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
            <p>© ${new Date().getFullYear()} Club Crocoders. Todos los derechos reservados.</p>
          </div>
        </div>
      `,
      text: `Hola ${name},\n\nTu registro para el evento "${eventDetails.nombre_evento}" ha sido exitoso.\n\nDetalles:\nFecha: ${formattedDate}\nHora: ${eventDetails.hora_inicio || '--:--'} - ${eventDetails.hora_fin || '--:--'}\n${eventDetails.costo > 0 ? `Costo: $${Number(eventDetails.costo).toFixed(2)}\n` : ''}\nRecibirás un recordatorio antes del evento.\n\nSaludos,\nClub Crocoders`
    };

    const sendMail = transporter.sendMail(mailOptions);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 30000)
    );

    await Promise.race([sendMail, timeout]);

    return NextResponse.json({
      success: true,
      message: 'Correo enviado exitosamente'
    });
  } catch (_) {
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo procesar la solicitud en este momento'
      },
      { status: 200 }
    );
  }
}
