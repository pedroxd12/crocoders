import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'Sesión cerrada correctamente'
    });

    // Eliminar la cookie
    response.cookies.set({
      name: 'token',
      value: '',
      expires: new Date(0),
      path: '/'
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