import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { rateLimit } from '@/lib/rate-limit';

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

// Comparación en tiempo constante de dos strings (evita timing attacks).
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// El código se guarda hasheado (SHA-256, 64 chars). Se tolera un valor legacy en
// texto plano (6 chars) por si quedaran filas previas a la migración 004.
function codigoCoincide(almacenado, ingresado) {
  if (!almacenado) return false;
  const hashIngresado = crypto.createHash('sha256').update(ingresado).digest('hex');
  if (almacenado.length === 64) return safeEqual(almacenado, hashIngresado);
  return safeEqual(almacenado, ingresado); // legacy en claro
}

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

    if (!codigoCoincide(tokenData.codigo_verificacion, verificationCode)) {
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

    // Secreto DEDICADO para tokens de recuperación (con fallback a JWT_SECRET para
    // no romper si la env no está configurada). El claim `purpose` impide reutilizar
    // un JWT de sesión normal en /reset-password aunque compartan secreto.
    const resetSecret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
    const sessionToken = jwt.sign(
      {
        id: tokenData.user_id,
        name: tokenData.name,
        email: email,
        temp: true,
        purpose: 'password_reset',
        tokenId: tokenData.id_token
      },
      resetSecret,
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
