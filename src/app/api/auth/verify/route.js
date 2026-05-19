import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

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

    return NextResponse.json({
      success: true,
      user: {
        id: decoded.id,
        name: decoded.name,
        email: decoded.email,
        role: decoded.role
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