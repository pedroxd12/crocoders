// api/confirmation/route.js
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { toDataURL } from 'qrcode';

export async function POST(request) {
  try {
    const data = await request.json();

    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Solicitud inválida' },
        { status: 200 }
      );
    }

    const { email, name, eventDetails, qrToken } = data;

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
    let formattedHoraInicio = eventDetails.hora_inicio || '--:--';
    let formattedHoraFin = eventDetails.hora_fin || '--:--';
    
    try {
      const date = new Date(eventDetails.fecha + 'T00:00:00');
      if (!isNaN(date.getTime())) {
        formattedDate = date.toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }
    } catch (_) {}
    
    // Formatear horas en formato 12h con AM/PM
    const formatTime = (timeStr) => {
      if (!timeStr || timeStr === '--:--') return timeStr;
      try {
        const [hours, minutes] = timeStr.split(':');
        const date = new Date();
        date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
        return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
      } catch (_) {
        return timeStr;
      }
    };
    
    formattedHoraInicio = formatTime(eventDetails.hora_inicio);
    formattedHoraFin = formatTime(eventDetails.hora_fin);

    let attachments = [];
    if (qrToken) {
        try {
            // Generate QR Code Image using the secure token
            const qrDataUrl = await toDataURL(qrToken, {
                errorCorrectionLevel: 'H',
                margin: 2,
                width: 300,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });
            // Convert Data URL to Buffer for attachment
            const base64Data = qrDataUrl.split(';base64,').pop();
            attachments.push({
                filename: 'ticket-qr.png',
                content: Buffer.from(base64Data, 'base64'),
                cid: 'uniquexqr@crocoders' // Reference ID for embedding in HTML
            });
        } catch (e) {
            console.error('Error generating QR for email:', e);
        }
    }

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
              <p><strong>Hora:</strong> ${formattedHoraInicio} - ${formattedHoraFin}</p>
              ${eventDetails.ubicacion ? `<p><strong>Ubicación:</strong> ${eventDetails.ubicacion}</p>` : ''}
              ${eventDetails.costo && eventDetails.costo > 0 ? `<p><strong>Costo:</strong> $${Number(eventDetails.costo).toFixed(2)} MXN</p>` : '<p><strong>Entrada:</strong> GRATUITA</p>'}
            </div>

            ${qrToken ? `
            <div style="text-align: center; margin: 30px 0; padding: 20px; background: white; border-radius: 10px; border: 2px dashed #1ef184;">
                <p style="margin-top: 0; font-weight: bold; color: #333;">TU TICKET DE ACCESO</p>
                <img src="cid:uniquexqr@crocoders" alt="QR Code" style="width: 200px; height: 200px;" />
                <p style="margin-bottom: 0; font-size: 12px; color: #888;">Presenta este código en la entrada</p>
            </div>
            ` : ''}

            <p style="font-size: 14px; color: #666;">Recibirás un recordatorio un día antes del evento.</p>
            <p style="font-size: 14px; color: #666;">Si tienes alguna pregunta, contáctanos respondiendo a este correo.</p>
          </div>
          <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
            <p>© ${new Date().getFullYear()} Club Crocoders. Todos los derechos reservados.</p>
          </div>
        </div>
      `,
      text: `Hola ${name},\n\nTu registro para el evento "${eventDetails.nombre_evento}" ha sido exitoso.\n\nDetalles:\nFecha: ${formattedDate}\nHora: ${formattedHoraInicio} - ${formattedHoraFin}\n${eventDetails.ubicacion ? `Ubicación: ${eventDetails.ubicacion}\n` : ''}${eventDetails.costo && eventDetails.costo > 0 ? `Costo: $${Number(eventDetails.costo).toFixed(2)} MXN\n` : 'Entrada: GRATUITA\n'}\n${qrToken ? 'Se adjunta tu código QR de acceso.\n' : ''}\nSaludos,\nClub Crocoders`,
      attachments: attachments
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
