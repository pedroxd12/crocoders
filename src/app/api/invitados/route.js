// src/app/api/invitados/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function POST(request) {
  try {
    const { 
      nombre_completo, 
      correo_electronico, 
      numero_telefono,
      semestre,
      carrera,
      escuela_institucion // NUEVO: Recibir el nuevo campo
    } = await request.json();

    // MODIFICADO: Validación para incluir escuela_institucion
    if (!nombre_completo || !correo_electronico || !escuela_institucion) {
      return NextResponse.json(
        { error: 'Nombre completo, correo electrónico y escuela/institución son requeridos' },
        { status: 400 }
      );
    }
     // Validar carrera/bachillerato como texto
     if (!carrera || carrera.trim() === '') {
        return NextResponse.json(
          { error: 'Carrera/Bachillerato es requerido' },
          { status: 400 }
        );
      }

    // Verificar si el invitado ya existe
    const [existingGuest] = await sql`
      SELECT id_invitado FROM invitado 
      WHERE correo_electronico = ${correo_electronico}
      LIMIT 1
    `;

    if (existingGuest) {
      // Actualizar datos del invitado existente, incluyendo escuela_institucion
      await sql`
        UPDATE invitado SET
          nombre_completo = ${nombre_completo},
          numero_telefono = ${numero_telefono || null},
          semestre = ${semestre || null},
          carrera = ${carrera || null},
          escuela_institucion = ${escuela_institucion || null} // NUEVO
        WHERE id_invitado = ${existingGuest.id_invitado}
      `;
      
      return NextResponse.json({
        success: true,
        id_invitado: existingGuest.id_invitado,
        message: 'Datos de invitado actualizados'
      });
    }

    // Insertar nuevo invitado, incluyendo escuela_institucion
    const [newGuest] = await sql`
      INSERT INTO invitado 
        (nombre_completo, correo_electronico, numero_telefono, semestre, carrera, escuela_institucion) -- NUEVO
      VALUES 
        (${nombre_completo}, ${correo_electronico}, ${numero_telefono || null}, ${semestre || null}, ${carrera || null}, ${escuela_institucion || null}) -- NUEVO
      RETURNING id_invitado
    `;

    return NextResponse.json({
      success: true,
      id_invitado: newGuest.id_invitado
    });
  } catch (error) {
    console.error('Error en POST /api/invitados:', error);
    // Verifica si el error es por violación de unicidad u otro error de DB
    if (error.code === '23505') { // Código de error para unique_violation en PostgreSQL
        if (error.constraint === 'invitado_correo_electronico_key') {
             return NextResponse.json(
               { error: 'Este correo electrónico ya está registrado como invitado.' },
               { status: 409 } // 409 Conflict
            );
        }
    }
    return NextResponse.json(
      { error: 'Error al registrar invitado: ' + error.message },
      { status: 500 }
    );
  }
}