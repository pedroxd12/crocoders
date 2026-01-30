// api/auth/login/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import bcrypt from 'bcryptjs';
import { createToken } from '@/lib/auth';

export async function POST(request) {
  try {
    const { correo_electronico, contrasena } = await request.json();

    if (
      !correo_electronico || typeof correo_electronico !== 'string' ||
      !contrasena || typeof contrasena !== 'string'
    ) {
      return NextResponse.json(
        { success: false, error: 'Credenciales inválidas' },
        { status: 200 }
      );
    }

    const user = await sql`
      SELECT 
        id_miembro as id,
        nombre_completo, 
        correo_electronico, 
        contrasena, 
        tipo as role 
      FROM miembro 
      WHERE correo_electronico = ${correo_electronico}
      LIMIT 1
    `;

    if (!user || user.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Credenciales inválidas' },
        { status: 200 }
      );
    }

    const userData = user[0];
    const passwordMatch = await bcrypt.compare(contrasena, userData.contrasena);

    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, error: 'Credenciales inválidas' },
        { status: 200 }
      );
    }

    const normalizedRole = userData.role === 'administrador' ? 'administrador' : 'usuario';

    const token = await createToken({
      id: userData.id,
      email: userData.correo_electronico,
      name: userData.nombre_completo,
      role: normalizedRole
    });

    const response = NextResponse.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      user: {
        id: userData.id,
        name: userData.nombre_completo,
        email: userData.correo_electronico,
        role: normalizedRole
      },
      redirectTo: normalizedRole === 'administrador' ? '/admin' : '/dashboard'
    });

    response.cookies.set({
      name: 'token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 1 semana
    });

    return response;
  } catch (error) {
    // No exponer errores en producción
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo procesar la solicitud'
      },
      { status: 200 }
    );
  }
}
