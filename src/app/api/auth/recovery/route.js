import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { sendRecoveryEmail } from '@/lib/email-service';

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'El email es requerido' },
        { status: 400 }
      );
    }

    // Buscar usuario por email
    const [user] = await sql`
      SELECT id_miembro, nombre, apellido_paterno, correo_electronico 
      FROM miembro 
      WHERE correo_electronico = ${email}
    `;

    if (!user) {
      return NextResponse.json(
        { error: 'No existe una cuenta con este email' },
        { status: 404 }
      );
    }

    const nombreCompleto = `${user.nombre} ${user.apellido_paterno || ''}`.trim();

    // Enviar email de recuperación
    await sendRecoveryEmail(user.correo_electronico, nombreCompleto, user.id_miembro);

    return NextResponse.json({
      success: true,
      message: 'Se ha enviado un correo con instrucciones para restablecer tu contraseña'
    });

  } catch (error) {
    console.error('Error en recuperación de contraseña:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor al procesar la solicitud' },
      { status: 500 }
    );
  }
}