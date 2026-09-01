// lib/auth.js
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está definido en las variables de entorno');
}

const secret = new TextEncoder().encode(JWT_SECRET);

// Vida de la sesión. Antes eran 7 días y el rol viajaba SOLO en el token: dar de
// baja a alguien o degradar a un administrador no surtía efecto hasta una semana
// después. Ahora `requireAuth` revalida contra la base de datos en cada petición
// (ver `revalidarMiembro`), pero se acorta igualmente la vida del token para
// limitar el daño de una cookie robada.
const VIDA_TOKEN = '2d';
export const DURACION_SESION_SEGUNDOS = 60 * 60 * 24 * 2;

// Atributos de la cookie de sesión, en un único sitio. Login y logout DEBEN usar
// exactamente los mismos: si divergen (p. ej. si mañana se añade `domain`), el
// borrado deja de casar con la cookie emitida y cerrar sesión no cierra nada.
export const COOKIE_SESION = Object.freeze({
  name: 'token',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
});

export const createToken = async (userData) => {
  try {
    return await new SignJWT(userData)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(VIDA_TOKEN)
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

// Roles coherentes con el CHECK de miembro.rol en el schema: administrador|usuario|staff.
// Nota: hoy `requireStaff` no lo usa ninguna ruta (los endpoints de /api/staff se
// guardan con requireAuth + pertenencia a staff_evento). Se conserva porque, con
// la revalidación de abajo, el rol que compara ya es el de la base de datos y no
// un claim obsoleto; unificar el modelo de staff toca archivos fuera de auth.
const STAFF_ROLES = new Set(['administrador', 'staff']);
const ADMIN_ROLES = new Set(['administrador']);

// --- Revalidación de la sesión contra la base de datos -----------------------
//
// El JWT es un documento firmado que no se puede retirar: sin este paso, una
// baja lógica (estado='baja' + deleted_at) o una degradación de rol no tenían
// ningún efecto sobre las sesiones ya emitidas.
//
// Se cachea unos segundos por miembro para no añadir un viaje a la BD en cada
// petición autenticada. El peor caso pasa de "7 días de acceso indebido" a
// "unos segundos".
const TTL_CACHE_MS = 15_000;
const MAX_CACHE = 5_000;
const cacheMiembros = new Map();

// Marca "no se pudo comprobar" (la BD no respondió), distinta de "no existe".
const SIN_VERIFICAR = Symbol('sin-verificar');

async function estadoMiembro(idMiembro) {
  const id = Number(idMiembro);
  if (!Number.isInteger(id) || id <= 0) return null;

  const entrada = cacheMiembros.get(id);
  if (entrada && entrada.expira > Date.now()) return entrada.valor;

  try {
    // Import dinámico a propósito: `src/proxy.js` importa este módulo y no debe
    // arrastrar el pool de `pg` sólo para verificar una firma.
    const { sql } = await import('@/lib/db-server');
    const filas = await sql`
      SELECT rol, estado, deleted_at FROM miembro WHERE id_miembro = ${id}
    `;
    const valor = filas[0] || null;
    if (cacheMiembros.size >= MAX_CACHE) cacheMiembros.clear();
    cacheMiembros.set(id, { valor, expira: Date.now() + TTL_CACHE_MS });
    return valor;
  } catch (error) {
    console.error('No se pudo revalidar la sesión contra la BD:', error);
    return SIN_VERIFICAR;
  }
}

/**
 * Invalida la copia cacheada de un miembro. Llamarla después de cambiarle el rol
 * o de darlo de baja hace que el corte sea inmediato en vez de esperar al TTL.
 * @param {number|string} idMiembro
 */
export function invalidarSesionEnCache(idMiembro) {
  cacheMiembros.delete(Number(idMiembro));
}

/**
 * ¿Sigue vigente el miembro de esta sesión?
 * @returns {Promise<{ vigente: boolean, rol: string|null }>} `rol` es el de la
 * base de datos (la única fuente de verdad) o null si no se pudo comprobar.
 */
export async function revalidarMiembro(idMiembro) {
  const miembro = await estadoMiembro(idMiembro);

  // La BD no responde: no se tiran sesiones legítimas por una caída (la propia
  // ruta va a fallar en su consulta de todos modos). Se conserva el rol del JWT.
  if (miembro === SIN_VERIFICAR) return { vigente: true, rol: null };

  // Coherente con el login: 'inactivo' y 'egresado' siguen siendo miembros; los
  // que se dan de baja desde el panel (estado='baja' + deleted_at) no.
  if (!miembro || miembro.deleted_at || miembro.estado === 'baja') {
    return { vigente: false, rol: null };
  }

  return { vigente: true, rol: miembro.rol };
}

/**
 * Helpers de autorización. Devuelven { ok: true, session } si está autorizado,
 * o { ok: false, response } con un NextResponse listo para retornar.
 */
export async function requireAuth(request) {
  const session = await getSession(request);
  if (!session) return await noAutorizado('No autenticado', 401);

  const { vigente, rol } = await revalidarMiembro(session.id);
  if (!vigente) return await noAutorizado('Sesión no válida', 401);

  // El rol autoritativo es el de la BD, no el claim firmado hace días. Como
  // requireAdmin/requireStaff leen `auth.session.role`, quedan corregidos aquí.
  return { ok: true, session: rol ? { ...session, role: rol } : session };
}

async function noAutorizado(error, status) {
  const { NextResponse } = await import('next/server');
  return { ok: false, response: NextResponse.json({ success: false, error }, { status }) };
}

export async function requireAdmin(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  const role = (auth.session.role || '').toLowerCase();
  if (!ADMIN_ROLES.has(role)) return await noAutorizado('Acceso denegado', 403);
  return { ok: true, session: auth.session };
}

export async function requireStaff(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  const role = (auth.session.role || '').toLowerCase();
  if (!STAFF_ROLES.has(role)) return await noAutorizado('Acceso denegado', 403);
  return { ok: true, session: auth.session };
}
