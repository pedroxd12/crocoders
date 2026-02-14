import { NextResponse } from 'next/server';
import pool, { sql } from '@/lib/db-server';
import bcrypt from 'bcryptjs';
import { createToken } from '@/lib/auth';

export async function POST(request) {
  let client;
  
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

    try {
      client = await pool.connect();
    } catch (connectionError) {
      console.error('💥 Error de conexión en /api/auth/login:', connectionError);
      return NextResponse.json(
        { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }
    
    let userData = null;

    try {
      // Buscar usuario en la nueva tabla miembro
      // Nota: El rol/tipo ya no existe en la tabla miembro segun el nuevo esquema.
      // Se asignará 'usuario' por defecto, o se podría implementar una lógica basada en una lista de administradores.
      const result = await client.query(`
        SELECT 
          id_miembro,
          nombre, 
          apellido_paterno,
          correo_electronico, 
          contrasena,
          rol
        FROM miembro 
        WHERE correo_electronico = $1
        LIMIT 1
      `, [correo_electronico]);

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Credenciales inválidas' },
          { status: 200 }
        );
      }
      
      userData = result.rows[0];

    } catch (dbError) {
      console.error('💥 Error de base de datos en login:', dbError);
      
      // Manejo específico de errores de conexión
      if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(dbError.code)) {
        return NextResponse.json(
          { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
          { status: 503 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: 'Error al verificar credenciales' },
        { status: 500 }
      );
    } finally {
      if (client) client.release();
    }

    const passwordMatch = await bcrypt.compare(contrasena, userData.contrasena);

    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, error: 'Credenciales inválidas' },
        { status: 200 }
      );
    }

    let normalizedRole = userData.rol || 'usuario';
    
    // Configuración de administradores (Fallback opcional o migración)
    // Si la base de datos ya tiene el rol, esto es redundante pero seguro durante la transición
    const ADMIN_EMAILS = ['admin@crocoders.com', 'admin@local.com'];
    if (ADMIN_EMAILS.includes(userData.correo_electronico)) normalizedRole = 'administrador';

    const nombreCompleto = `${userData.nombre} ${userData.apellido_paterno}`.trim();

    const token = await createToken({
      id: userData.id_miembro,
      email: userData.correo_electronico,
      name: nombreCompleto,
      role: normalizedRole
    });

    const response = NextResponse.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      user: {
        id: userData.id_miembro,
        name: nombreCompleto,
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
    console.error('💥 Error en login:', error);
    
    // Manejo específico de errores de conexión
    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Error en el inicio de sesión' },
      { status: 500 }
    );
  }
}
