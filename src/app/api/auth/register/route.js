// src/app/api/auth/register/route.js
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
      numero_telefono, // Ya se recibía, ahora será validado como requerido
      usuario_codeforces, // Ya se recibía, ahora será validado como requerido
      usuario_vjudge, // Ya se recibía, ahora será validado como requerido
      usuario_omegaup, // Ya se recibía, ahora será validado como requerido
      semestre,
      carrera
    } = await request.json();

    // Validaciones básicas (existencia y coincidencia de contraseñas)
    if (!nombre_completo || !correo_electronico || !contrasena || !confirmar_contrasena) {
      return NextResponse.json(
        { success: false, error: 'Nombre, correo y contraseñas son requeridos.' },
        { status: 400 }
      );
    }

    if (contrasena !== confirmar_contrasena) {
      return NextResponse.json(
        { success: false, error: 'Las contraseñas no coinciden.' },
        { status: 400 }
      );
    }
    
    // NUEVO: Validar campos ahora requeridos
    if (!numero_telefono || !usuario_codeforces || !usuario_vjudge || !usuario_omegaup) {
        return NextResponse.json(
            { success: false, error: 'Número de teléfono y usuarios de plataformas (Codeforces, VJudge, OmegaUp) son requeridos.' },
            { status: 400 }
        );
    }
    
    // Validar formato del número de teléfono (ejemplo: 10-15 dígitos)
    if (!/^[0-9]{10,15}$/.test(numero_telefono)) {
        return NextResponse.json(
            { success: false, error: 'El número de teléfono no es válido (debe tener entre 10 y 15 dígitos).' },
            { status: 400 }
        );
    }


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
          numero_telefono, // Ahora siempre presente 
          'usuario',
          semestre,
          carrera
        ]
      );

      const user = newUser.rows[0];

      // Insertar datos en tablas relacionadas (si existen)
      // Los campos de plataformas ahora son requeridos, por lo que siempre se intentará insertar
      const platformInserts = [
        client.query(
          'INSERT INTO codeforces (id_miembro, usuario) VALUES ($1, $2)',
          [user.id_miembro, usuario_codeforces]
        ),
        client.query(
          'INSERT INTO vjudge (id_miembro, usuario) VALUES ($1, $2)',
          [user.id_miembro, usuario_vjudge]
        ),
        client.query(
          'INSERT INTO omegaup (id_miembro, usuario) VALUES ($1, $2)',
          [user.id_miembro, usuario_omegaup]
        )
      ];
      
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