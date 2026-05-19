import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function POST(request) {
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
    
    try {
      decoded = jwt.verify(sessionToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return NextResponse.json(
        { error: 'Sesión inválida o expirada' },
        { status: 401 }
      );
    }

    // Verificar que el token sea temporal y coincida con el email
    if (!decoded.temp || decoded.email !== email) {
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

    // Verificar que el token de recuperación aún sea válido
    const [token] = await sql`
      SELECT * FROM password_reset_token 
      WHERE id_token = ${decoded.tokenId} AND id_miembro = ${decoded.id}
    `;

    if (!token) {
      return NextResponse.json(
        { error: 'La solicitud de recuperación ya no es válida' },
        { status: 401 }
      );
    }

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

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