import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { sendRecoveryEmail } from '@/lib/email-service';
import { rateLimit } from '@/lib/rate-limit';

// Respuesta única usada tanto para éxito como para "email no existe" (no revela enumeración).
const UNIFORM_RESPONSE = {
  success: true,
  message: 'Si la cuenta existe, se enviará un correo con instrucciones para restablecer la contraseña.'
};

export async function POST(request) {
  // Rate limit estricto: 5 solicitudes / 15 min por IP
  const rl = rateLimit(request, { scope: 'recovery', limit: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiadas solicitudes. Intente más tarde.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      // Aun aquí devolvemos uniforme para no revelar la forma del input.
      return NextResponse.json(UNIFORM_RESPONSE);
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await sql`
      SELECT id_miembro, nombre, apellido_paterno, correo_electronico
      FROM miembro
      WHERE correo_electronico = ${normalizedEmail}
    `;

    if (user) {
      const nombreCompleto = `${user.nombre} ${user.apellido_paterno || ''}`.trim();
      // Envío en best-effort. Errores internos no deben filtrarse al cliente.
      try {
        await sendRecoveryEmail(user.correo_electronico, nombreCompleto, user.id_miembro);
      } catch (e) {
        console.error('Fallo enviando email de recuperación:', e);
      }
    }

    return NextResponse.json(UNIFORM_RESPONSE);
  } catch (error) {
    console.error('Error en recuperación de contraseña:', error);
    // También uniforme para evitar señales por excepción
    return NextResponse.json(UNIFORM_RESPONSE);
  }
}
