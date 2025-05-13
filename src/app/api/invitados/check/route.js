import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email es requerido' },
        { status: 400 }
      );
    }

    const [invitado] = await sql`
      SELECT id_invitado FROM invitado 
      WHERE correo_electronico = ${email}
      LIMIT 1
    `;

    return NextResponse.json({
      exists: !!invitado
    });
  } catch (error) {
    console.error('Error en GET /api/invitados/check:', error);
    return NextResponse.json(
      { error: 'Error al verificar invitado: ' + error.message },
      { status: 500 }
    );
  }
}