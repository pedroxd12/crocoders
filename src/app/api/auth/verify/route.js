import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { revalidarMiembro } from '@/lib/auth';

export async function GET(request) {
  try {
    const token = request.cookies.get('token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Sesión no válida' },
        { status: 200 }
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // El token es un papel firmado hace días: puede afirmar un rol que ya no
    // existe o pertenecer a alguien dado de baja. Se relee el miembro para que
    // el cliente (ProtectedRoute, panel admin) vea el estado real y no una
    // fotografía vieja.
    const { vigente, rol } = await revalidarMiembro(decoded.id);

    if (!vigente) {
      return NextResponse.json(
        { success: false, error: 'Sesión no válida' },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: decoded.id,
        name: decoded.name,
        email: decoded.email,
        // `rol` es null sólo si la BD no respondió; ahí se conserva el del token.
        role: rol || decoded.role
      }
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return NextResponse.json(
        { success: false, error: 'Sesión expirada o inválida' },
        { status: 200 }
      );
    }
    console.error('Error en verify:', error);
    return NextResponse.json(
      { success: false, error: 'Error al verificar la sesión' },
      { status: 500 }
    );
  }
}
