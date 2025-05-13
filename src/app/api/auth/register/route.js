import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import bcrypt from 'bcryptjs';
import { createToken } from '@/lib/auth';

export async function POST(request) {
  try {
    const { 
      nombre_completo,
      correo_electronico,
      contrasena,
      confirmar_contrasena,
      numero_telefono,
      usuario_codeforces,
      usuario_vjudge,
      usuario_omegaup,
      semestre,
      carrera
    } = await request.json();

    // Validaciones básicas
    if (!nombre_completo || !correo_electronico || !contrasena || !confirmar_contrasena) {
      return NextResponse.json(
        { success: false, error: 'Todos los campos son requeridos' },
        { status: 400 }
      );
    }

    // Validar que las contraseñas coincidan
    if (contrasena !== confirmar_contrasena) {
      return NextResponse.json(
        { success: false, error: 'Las contraseñas no coinciden' },
        { status: 400 }
      );
    }

    // Validar semestre y carrera
    if (!semestre || !carrera) {
      return NextResponse.json(
        { success: false, error: 'Semestre y carrera son requeridos' },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      // Verificar si el usuario ya existe
      const existingUser = await client.query(
        'SELECT id_miembro FROM miembro WHERE correo_electronico = $1',
        [correo_electronico]
      );

      if (existingUser.rows.length > 0) {
        return NextResponse.json(
          { success: false, error: 'El correo electrónico ya está registrado' },
          { status: 400 }
        );
      }

      // Hash de la contraseña
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

      // Insertar nuevo usuario
      const newUser = await client.query(
        `INSERT INTO miembro (
          nombre_completo,
          correo_electronico,
          contrasena,
          numero_telefono,
          tipo,
          semestre,
          carrera
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id_miembro, nombre_completo, correo_electronico, tipo, semestre, carrera`,
        [
          nombre_completo, 
          correo_electronico, 
          hashedPassword, 
          numero_telefono || null, 
          'usuario',
          semestre,
          carrera
        ]
      );

      const user = newUser.rows[0];

      // Insertar datos en tablas relacionadas (si existen)
      const platformInserts = [];
      
      if (usuario_codeforces) {
        platformInserts.push(
          client.query(
            'INSERT INTO codeforces (id_miembro, usuario) VALUES ($1, $2)',
            [user.id_miembro, usuario_codeforces]
          )
        );
      }

      if (usuario_vjudge) {
        platformInserts.push(
          client.query(
            'INSERT INTO vjudge (id_miembro, usuario) VALUES ($1, $2)',
            [user.id_miembro, usuario_vjudge]
          )
        );
      }

      if (usuario_omegaup) {
        platformInserts.push(
          client.query(
            'INSERT INTO omegaup (id_miembro, usuario) VALUES ($1, $2)',
            [user.id_miembro, usuario_omegaup]
          )
        );
      }

      // Ejecutar todas las inserciones en paralelo
      await Promise.all(platformInserts);

      // Crear token JWT con los datos del usuario
      const token = await createToken({
        id: user.id_miembro,
        email: user.correo_electronico,
        name: user.nombre_completo,
        role: user.tipo,
        semester: user.semestre,
        career: user.carrera
      });

      // Configurar la respuesta
      const response = NextResponse.json({
        success: true,
        message: 'Registro exitoso. Redirigiendo...',
        user: {
          id: user.id_miembro,
          name: user.nombre_completo,
          email: user.correo_electronico,
          role: user.tipo,
          semester: user.semestre,
          career: user.carrera
        },
        redirectTo: '/dashboard'
      });

      // Establecer cookie HTTP-only segura
      response.cookies.set('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 días
        priority: 'high'
      });

      return response;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error en registro:', error);
    return NextResponse.json(
      { success: false, error: 'Error en el servidor. Por favor, intente nuevamente.' },
      { status: 500 }
    );
  }
}