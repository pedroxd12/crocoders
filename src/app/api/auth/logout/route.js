import { NextResponse } from 'next/server';
import { COOKIE_SESION } from '@/lib/auth';

export async function POST() {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'Sesión cerrada correctamente'
    });

    // Se borra con EXACTAMENTE los mismos atributos con los que la fijó el
    // login (COOKIE_SESION). Antes se reescribía sin httpOnly/secure/sameSite:
    // funcionaba de milagro y cualquier cambio futuro de atributos en el login
    // habría dejado de cerrar la sesión en silencio.
    response.cookies.set({
      ...COOKIE_SESION,
      value: '',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('Error en logout:', error);
    return NextResponse.json(
      { success: false, error: 'Error al cerrar sesión' },
      { status: 500 }
    );
  }
}
