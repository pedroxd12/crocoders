import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request) {
  // Era el único endpoint del flujo de recuperación sin freno (login, registro,
  // recovery y verify-token sí lo tienen).
  const rl = rateLimit(request, { scope: 'reset-password', limit: 10, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intente más tarde.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const { newPassword, email } = await request.json();
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const sessionToken = authHeader.split(' ')[1];
    let decoded;

    // Mismo secreto dedicado que usó /verify-token al firmar (con fallback).
    const resetSecret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
    try {
      decoded = jwt.verify(sessionToken, resetSecret, { algorithms: ['HS256'] });
    } catch (err) {
      return NextResponse.json(
        { error: 'Sesión inválida o expirada' },
        { status: 401 }
      );
    }

    // El JWT lleva el correo ya normalizado (lo firma /api/auth/verify-token),
    // así que aquí hay que normalizar igual: si el usuario tecleó una mayúscula
    // en el formulario, la comparación cruda fallaba y el restablecimiento se
    // caía con "Token de sesión inválido" en el último paso.
    const emailNormalizado = String(email || '').trim().toLowerCase();

    // Verificar que el token sea temporal, con propósito de recuperación y email correcto.
    if (!decoded.temp || decoded.purpose !== 'password_reset' || decoded.email !== emailNormalizado) {
      return NextResponse.json(
        { error: 'Token de sesión inválido para esta operación' },
        { status: 401 }
      );
    }

    // Validar fortaleza de la contraseña
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      );
    }

    // Verificar que el token de recuperación aún exista y no haya expirado
    const [token] = await sql`
      SELECT id_token FROM password_reset_token
      WHERE id_token = ${decoded.tokenId}
        AND id_miembro = ${decoded.id}
        AND expires_at > NOW()
    `;

    if (!token) {
      return NextResponse.json(
        { error: 'La solicitud de recuperación ya no es válida' },
        { status: 401 },
      );
    }

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Actualizar contraseña
    await sql`
      UPDATE miembro 
      SET contrasena = ${hashedPassword} 
      WHERE id_miembro = ${decoded.id}
    `;

    // Eliminar todos los tokens de recuperación para este usuario
    await sql`
      DELETE FROM password_reset_token 
      WHERE id_miembro = ${decoded.id}
    `;

    return NextResponse.json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    });

  } catch (error) {
    console.error('Error en restablecimiento:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor al restablecer la contraseña' },
      { status: 500 }
    );
  }
}