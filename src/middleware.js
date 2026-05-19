// middleware.js
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { APP_ROLES } from '@/lib/roles';

const ROLES = APP_ROLES;

const PUBLIC_PATHS = [
  '/',
  '/club',
  '/capitulo',
  '/iniciar',
  '/eventos',
  '/contacto',
  '/puntajes',
  '/evidencias',
  '/api/auth/(.*)',
  '/api/eventos/(.*)',
  '/api/uploadthing/(.*)',
  '/api/evidencias/(.*)',
  '/api/puntajes(.*)',
  '/favicon.ico',
  '/eventos/(.*)', 
  '/_next/(.*)',
  '/public/(.*)',
  '/video/(.*)',
  '/public/uploads/eventos/(.*)',
  '/evidencia/(.*)',
  '/img/uploads/eventos/(.*)',
  '/img/(.*)', 
  '/fonts/(.*)' 
];

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|img/|fonts/|teclado/|evidencia/|capitulo/|club/).*)',
  ]
};

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Permitir archivos estáticos y recursos públicos sin autenticación
  if (
    pathname.startsWith('/_next/') || 
    pathname === '/favicon.ico' ||
    pathname.startsWith('/img/') ||
    pathname.startsWith('/uploads/') ||
    pathname.startsWith('/public/') ||
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/teclado/') ||
    pathname.startsWith('/evidencia/') ||
    pathname.startsWith('/capitulo/') ||
    pathname.startsWith('/club/') ||
    pathname.startsWith('/api/')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;

  // Verificar si la ruta es pública
  const isPublicPath = PUBLIC_PATHS.some(publicPath => {
    const regex = new RegExp(`^${publicPath.replace(/\*/g, '.*').replace(/\//g, '\\/')}$`);
    return regex.test(pathname);
  });

  // Manejar rutas públicas
  if (isPublicPath) {
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
    loginUrl.searchParams.set('from', request.nextUrl.pathname);
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