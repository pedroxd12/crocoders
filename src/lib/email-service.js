import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { sql } from './db-server';

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  secure: true,
  tls: {
    rejectUnauthorized: true
  }
});

export async function sendRecoveryEmail(email, name, userId) {
  try {
    // Generar token único y código de verificación
    const token = crypto.randomBytes(32).toString('hex');
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Establecer fecha de expiración (1 hora)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Guardar token en la base de datos
    await sql`
      DELETE FROM password_reset_tokens 
      WHERE user_id = ${userId}
    `;

    await sql`
      INSERT INTO password_reset_tokens 
        (user_id, token, verification_code, expires_at) 
      VALUES 
        (${userId}, ${token}, ${verificationCode}, ${expiresAt})
    `;

    const resetLink = `${process.env.NEXT_PUBLIC_SITE_URL}/iniciar?recovery=true`;
    
    const mailOptions = {
      from: `"Club Crocoders" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Restablece tu contraseña',
      html: `
        <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="cid:logo" alt="Club Crocoders" style="max-width: 150px; height: auto;" />
          </div>
          <div style="background-color: #f9f9f9; padding: 25px; border-radius: 8px; border: 1px solid #e1e1e1;">
            <h2 style="color: #10B981; margin-top: 0;">Hola ${name},</h2>
            <p>Hemos recibido una solicitud para restablecer tu contraseña en tu cuenta de Club Crocoders.</p>
            <p>Tu código de verificación es: <strong>${verificationCode}</strong></p>

            <p style="font-size: 14px; color: #666;">Este enlace expirará en 1 hora, no lo compartas con nadie.</p>
            <p style="font-size: 14px; color: #666;">Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: 'logo.png',
        path: `${process.cwd()}/public/img/logo.png`,
        cid: 'logo'
      }]
    };

    await transporter.sendMail(mailOptions);
    console.log('Correo de recuperación enviado a:', email);
    return { success: true };
  } catch (error) {
    console.error('Error al enviar correo de recuperación:', error);
    throw error;
  }
}