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
  '/programas',
  '/contacto',
  '/puntajes',
  '/evidencias',
  // Sigue listada como pública aunque la convocatoria esté oculta: así quien
  // la abra sin sesión llega a la página, que responde 404 (ver
  // src/lib/hackaitlac-publica.js). Si se quitara de aquí, el proxy la mandaría
  // a /iniciar y ese "inicia sesión" delataría que la página existe.
  '/hackaitlac',
  '/favicon.ico',
];

// Sólo prefijos de PÁGINA y de recursos estáticos. Aquí había además una lista
// de prefijos `/api/...` que no hacía nada: el `matcher` de abajo excluye `api`
// por completo, así que el proxy nunca llega a ver una petición de API. Tenerlos
// escritos hacía creer que este archivo protegía los endpoints; la autorización
// de las APIs vive en cada ruta (requireAuth / requireAdmin de src/lib/auth.js).
const PUBLIC_PATH_PREFIXES = [
  '/eventos/',
  '/programas/',
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
  '/hackaitlac/',
];

// El matcher excluye archivos estáticos para que el proxy ni se invoque en ellos.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|_next/data|favicon.ico|img/|fonts/|teclado/|evidencia/|capitulo/|club/|uploads/|video/|hackaitlac/).*)',
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
    // Redirigir a quien ya tiene sesión y abre la pantalla de acceso.
    //
    // La home ('/') NO entra aquí: es una página pública como cualquier otra y
    // expulsar de ella a todo usuario con sesión dejaba el enlace "Inicio" del
    // menú inalcanzable para los miembros.
    if (token && pathname === '/iniciar') {
      try {
        const user = await verifyToken(token);
        if (user) {
          // `?registerEvent=N` viene de pulsar "Participar" en un evento y la
          // propia pantalla de /iniciar sabe completar el registro cuando ya hay
          // sesión (iniciar/page.js:172). Redirigir aquí descartaba el
          // parámetro y el registro al evento se perdía por el camino.
          if (request.nextUrl.searchParams.has('registerEvent')) {
            return NextResponse.next();
          }
          // El resto de parámetros (p. ej. `from`) se conservan.
          const redirectUrl = user.role === ROLES.ADMIN ? '/admin' : '/dashboard';
          return NextResponse.redirect(
            new URL(`${redirectUrl}${request.nextUrl.search}`, request.url),
          );
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
