import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import jwt from 'jsonwebtoken';
import { rateLimit } from '@/lib/rate-limit';

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request) {
  try {
    const { email, verificationCode } = await request.json();

    if (!email || !verificationCode) {
      return NextResponse.json(
        { error: 'Email y código de verificación son requeridos' },
        { status: 400 }
      );
    }

    // Contador de intentos por IP+email; tras 5 fallos en 15 min se bloquea.
    const scope = `verify-token:${String(email).trim().toLowerCase()}`;
    const rl = rateLimit(request, { scope, limit: MAX_ATTEMPTS, windowMs: ATTEMPT_WINDOW_MS });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Espere antes de volver a intentar.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    if (!/^\d{6}$/.test(verificationCode)) {
      return NextResponse.json(
        { error: 'El código de verificación debe ser de 6 dígitos' },
        { status: 400 }
      );
    }

    const result = await sql`
      SELECT pr.*, m.id_miembro as user_id, m.nombre || ' ' || m.apellido_paterno as name
      FROM password_reset_token pr
      JOIN miembro m ON pr.id_miembro = m.id_miembro
      WHERE m.correo_electronico = ${email}
      ORDER BY pr.expires_at DESC
      LIMIT 1
    `;

    const tokenData = result[0];

    if (!tokenData) {
      return NextResponse.json(
        { error: 'Código inválido o expirado' },
        { status: 400 }
      );
    }

    if (tokenData.codigo_verificacion !== verificationCode) {
      return NextResponse.json(
        { error: 'Código inválido o expirado' },
        { status: 400 }
      );
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Código inválido o expirado' },
        { status: 400 }
      );
    }

    const sessionToken = jwt.sign(
      {
        id: tokenData.user_id,
        name: tokenData.name,
        email: email,
        temp: true,
        tokenId: tokenData.id_token
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' }
    );

    return NextResponse.json({
      success: true,
      message: 'Verificación exitosa',
      sessionToken
    });

  } catch (error) {
    console.error('Error en verificación:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor al verificar el código' },
      { status: 500 }
    );
  }
}
