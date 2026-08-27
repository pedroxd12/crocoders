import crypto from 'crypto';
import { sql } from './db-server';
import { sendMail, escapeHtml, institutionalFrom, mailIsConfigured } from './mailer';

export async function sendRecoveryEmail(email, name, userId) {
  if (!mailIsConfigured()) {
    throw new Error('EMAIL_USER / EMAIL_PASSWORD no configurados');
  }

  try {
    // Token criptográficamente fuerte y código de 6 dígitos generado con crypto.randomInt
    const token = crypto.randomBytes(32).toString('hex');
    const verificationCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    // Se almacena el HASH del código, nunca el código en claro (este solo viaja en
    // el correo). Requiere la migración 004 (columna varchar(64)).
    const codigoHash = crypto.createHash('sha256').update(verificationCode).digest('hex');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Atómico: borrar tokens previos del usuario e insertar el nuevo en una sola
    // consulta. Evita la ventana en que un fallo entre DELETE e INSERT dejaría
    // al usuario sin token.
    await sql`
      WITH purge AS (
        DELETE FROM password_reset_token WHERE id_miembro = ${userId}
      )
      INSERT INTO password_reset_token
        (id_miembro, token, codigo_verificacion, expires_at)
      VALUES
        (${userId}, ${token}, ${codigoHash}, ${expiresAt})
    `;

    // El nombre viene de la BD, pero lo escribió el propio usuario al
    // registrarse: se escapa antes de entrar al HTML del correo.
    const nombreSeguro = escapeHtml(name);

    await sendMail({
      from: institutionalFrom(),
      to: email,
      subject: 'Restablece tu contraseña',
      text:
        `Hola ${name},\n\n` +
        'Hemos recibido una solicitud para restablecer tu contraseña en Club Crocoders.\n' +
        `Tu código de verificación es: ${verificationCode}\n\n` +
        'El código expira en 1 hora. No lo compartas con nadie.\n' +
        'Si no solicitaste este cambio, puedes ignorar este mensaje.',
      html: `
        <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="cid:logo" alt="Club Crocoders" style="max-width: 150px; height: auto;" />
          </div>
          <div style="background-color: #f9f9f9; padding: 25px; border-radius: 8px; border: 1px solid #e1e1e1;">
            <h2 style="color: #10B981; margin-top: 0;">Hola ${nombreSeguro},</h2>
            <p>Hemos recibido una solicitud para restablecer tu contraseña en tu cuenta de Club Crocoders.</p>
            <p>Tu código de verificación es: <strong>${verificationCode}</strong></p>

            <p style="font-size: 14px; color: #666;">Este código expirará en 1 hora, no lo compartas con nadie.</p>
            <p style="font-size: 14px; color: #666;">Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: 'logo.png',
        path: `${process.cwd()}/public/img/logo.png`,
        cid: 'logo'
      }]
    });

    // No se registra el correo del destinatario en los logs.
    console.log('Correo de recuperación enviado (miembro %s)', userId);
    return { success: true };
  } catch (error) {
    console.error('Error al enviar correo de recuperación:', error.message);
    throw error;
  }
}
