import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import jwt from 'jsonwebtoken';

export async function POST(request) {
  try {
    const { email, verificationCode } = await request.json();

    if (!email || !verificationCode) {
      return NextResponse.json(
        { error: 'Email y código de verificación son requeridos' },
        { status: 400 }
      );
    }

    // Validar formato del código (6 dígitos)
    if (!/^\d{6}$/.test(verificationCode)) {
      return NextResponse.json(
        { error: 'El código de verificación debe ser de 6 dígitos' },
        { status: 400 }
      );
    }

    // Verificar código de verificación y token
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
        { error: 'No se encontró solicitud de recuperación para este email' },
        { status: 404 }
      );
    }

    if (tokenData.codigo_verificacion !== verificationCode) {
      return NextResponse.json(
        { error: 'Código de verificación incorrecto' },
        { status: 400 }
      );
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'El código de verificación ha expirado' },
        { status: 400 }
      );
    }

    // Generar token de sesión seguro
    const sessionToken = jwt.sign(
      {
        id: tokenData.user_id,
        name: tokenData.name,
        email: email,
        temp: true,
        tokenId: tokenData.id_token // Incluir ID del token para referencia
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
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