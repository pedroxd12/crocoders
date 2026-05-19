// lib/auth.js
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está definido en las variables de entorno');
}

const secret = new TextEncoder().encode(JWT_SECRET);

export const createToken = async (userData) => {
  try {
    return await new SignJWT(userData)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);
  } catch (error) {
    console.error('Error al crear token:', error);
    throw new Error('Error al generar el token de autenticación');
  }
};

export const verifyToken = async (token) => {
  try {
    if (!token) return null;

    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    console.error('Error al verificar token:', error.message);
    return null;
  }
};

/**
 * Extrae y verifica el JWT de la cookie 'token' o del header Authorization.
 * Devuelve el payload si es válido, null en caso contrario.
 */
export async function getSession(request) {
  try {
    let token = request?.cookies?.get?.('token')?.value || null;
    if (!token) {
      const auth = request?.headers?.get?.('authorization') || '';
      if (auth.startsWith('Bearer ')) token = auth.slice(7);
    }
    if (!token) return null;
    return await verifyToken(token);
  } catch {
    return null;
  }
}

const STAFF_ROLES = new Set(['administrador', 'staff', 'organizador', 'admin']);
const ADMIN_ROLES = new Set(['administrador', 'admin']);

/**
 * Helpers de autorización. Devuelven { ok: true, session } si está autorizado,
 * o { ok: false, response } con un NextResponse listo para retornar.
 */
export async function requireAuth(request) {
  const session = await getSession(request);
  if (!session) {
    const { NextResponse } = await import('next/server');
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 }),
    };
  }
  return { ok: true, session };
}

export async function requireAdmin(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  const role = (auth.session.role || '').toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    const { NextResponse } = await import('next/server');
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Acceso denegado' }, { status: 403 }),
    };
  }
  return { ok: true, session: auth.session };
}

export async function requireStaff(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  const role = (auth.session.role || '').toLowerCase();
  if (!STAFF_ROLES.has(role)) {
    const { NextResponse } = await import('next/server');
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Acceso denegado' }, { status: 403 }),
    };
  }
  return { ok: true, session: auth.session };
}
