import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function POST(request) {
  try {
    const { 
      nombre_completo, 
      correo_electronico, 
      numero_telefono,
      semestre,
      carrera
    } = await request.json();

    if (!nombre_completo || !correo_electronico) {
      return NextResponse.json(
        { error: 'Nombre completo y correo electrónico son requeridos' },
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
      // Actualizar datos del invitado existente
      await sql`
        UPDATE invitado SET
          nombre_completo = ${nombre_completo},
          numero_telefono = ${numero_telefono || null},
          semestre = ${semestre || null},
          carrera = ${carrera || null}
        WHERE id_invitado = ${existingGuest.id_invitado}
      `;
      
      return NextResponse.json({
        success: true,
        id_invitado: existingGuest.id_invitado,
        message: 'Datos de invitado actualizados'
      });
    }

    // Insertar nuevo invitado
    const [newGuest] = await sql`
      INSERT INTO invitado 
        (nombre_completo, correo_electronico, numero_telefono, semestre, carrera)
      VALUES 
        (${nombre_completo}, ${correo_electronico}, ${numero_telefono || null}, ${semestre || null}, ${carrera || null})
      RETURNING id_invitado
    `;

    return NextResponse.json({
      success: true,
      id_invitado: newGuest.id_invitado
    });
  } catch (error) {
    console.error('Error en POST /api/invitados:', error);
    return NextResponse.json(
      { error: 'Error al registrar invitado' },
      { status: 500 }
    );
  }
}