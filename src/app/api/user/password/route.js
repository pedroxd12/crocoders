import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export async function PUT(request) {
  try {
    const token = request.cookies.get('token')?.value;
    const { currentPassword, newPassword } = await request.json();
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Se requieren ambas contraseñas' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Obtener contraseña actual
    const user = await sql`
      SELECT contrasena FROM miembro WHERE id_miembro = ${decoded.id}
    `;

    if (!user || user.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Verificar contraseña actual
    const validPassword = await bcrypt.compare(currentPassword, user[0].contrasena);
    if (!validPassword) {
      return NextResponse.json(
        { success: false, error: 'La contraseña actual es incorrecta' },
        { status: 400 }
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

    return NextResponse.json({ 
      success: true,
      message: 'Contraseña actualizada correctamente'
    });
  } catch (error) {
    console.error('Error en cambio de contraseña:', error);
    return NextResponse.json(
      { success: false, error: 'Error al cambiar la contraseña' },
      { status: 500 }
    );
  }
}