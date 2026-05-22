// proxy.js
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { APP_ROLES } from '@/lib/roles';

const ROLES = APP_ROLES;

// Rutas públicas precompiladas una sola vez al cargar el módulo
const PUBLIC_PATHS = [
  '/',
  '/club',
  '/capitulo',
  '/iniciar',
  '/eventos',
  '/contacto',
  '/puntajes',
  '/evidencias',
  '/favicon.ico',
];

const PUBLIC_PATH_PREFIXES = [
  '/api/auth/',
  '/api/eventos/',
  '/api/uploadthing/',
  '/api/evidencias/',
  '/api/puntajes',
  '/eventos/',
  '/evidencia/',
  '/img/',
  '/fonts/',
  '/video/',
  '/_next/',
  '/public/',
  '/uploads/',
  '/teclado/',
  '/capitulo/',
  '/club/',
];

// El matcher excluye archivos estáticos para que el proxy ni se invoque en ellos.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|_next/data|favicon.ico|img/|fonts/|teclado/|evidencia/|capitulo/|club/|uploads/|video/).*)',
  ],
};

function isStaticOrApi(pathname) {
  // Short-circuit barato (no regex) para evitar trabajo en cada request.
  // El matcher ya filtra la mayoría, pero esto cubre cualquier edge case.
  if (pathname === '/favicon.ico') return true;
  for (let i = 0; i < PUBLIC_PATH_PREFIXES.length; i++) {
    if (pathname.startsWith(PUBLIC_PATH_PREFIXES[i])) return true;
  }
  return pathname.startsWith('/api/');
}

function isPublicPath(pathname) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  for (let i = 0; i < PUBLIC_PATH_PREFIXES.length; i++) {
    if (pathname.startsWith(PUBLIC_PATH_PREFIXES[i])) return true;
  }
  return false;
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Permitir archivos estáticos y recursos públicos sin autenticación
  if (isStaticOrApi(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;

  // Manejar rutas públicas
  if (isPublicPath(pathname)) {
    // Redirigir usuarios autenticados que intentan acceder a login/registro
    if (token && (pathname === '/iniciar' || pathname === '/')) {
      try {
        const user = await verifyToken(token);
        if (user) {
          const redirectUrl = user.role === ROLES.ADMIN ? '/admin' : '/dashboard';
          return NextResponse.redirect(new URL(redirectUrl, request.url));
        }
      } catch (error) {
        console.error('Error verificando token:', error);
        const response = NextResponse.next();
        response.cookies.delete('token');
        return response;
      }
    }
    return NextResponse.next();
  }

  // Proteger rutas privadas
  if (!token) {
    const loginUrl = new URL('/iniciar', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verificar token para rutas protegidas
  try {
    const user = await verifyToken(token);

    if (!user) {
      throw new Error('Token inválido');
    }

    // Control de acceso por roles
    if (pathname.startsWith('/admin') && user.role !== ROLES.ADMIN) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Permitir acceso a /staff para todos los usuarios autenticados (miembros)
    // La verificación de si realmente son staff se hace en las APIs
    if (pathname.startsWith('/staff') && user.role === ROLES.ADMIN) {
      // Los admins no usan el panel de staff, redirigir al admin
      return NextResponse.redirect(new URL('/admin', request.url));
    }

    // Redirigir a la página correcta si el usuario está autenticado pero en una ruta no adecuada
    if ((pathname === '/dashboard' && user.role === ROLES.ADMIN) ||
        (pathname === '/admin' && user.role !== ROLES.ADMIN)) {
      const redirectUrl = user.role === ROLES.ADMIN ? '/admin' : '/dashboard';
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Error de autenticación:', error);
    const response = NextResponse.redirect(new URL('/iniciar', request.url));
    response.cookies.delete('token');
    return response;
  }
}
