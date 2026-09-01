import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import bcrypt from 'bcryptjs';
import { createToken, COOKIE_SESION, DURACION_SESION_SEGUNDOS } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

// Hash dummy precomputado (cost 12, valor irrelevante) para igualar el costo de
// `bcrypt.compare` cuando el correo no existe. Evita timing attacks de
// enumeración de cuentas.
const DUMMY_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8U.HRZ8kIfMz9p3FvGz4PIK1H1RXja';

// Sin límite, este endpoint permite probar contraseñas indefinidamente. Se
// aplican dos frenos: uno por IP (bloquea el barrido de muchas cuentas desde un
// mismo origen) y otro por cuenta (bloquea el ataque distribuido contra un solo
// correo, donde rotar de IP evadiría el primero).
const LIMITE_POR_IP = { limit: 20, windowMs: 15 * 60 * 1000 };
const LIMITE_POR_CUENTA = { limit: 10, windowMs: 15 * 60 * 1000 };

// Respuesta única para "no existe" y "contraseña incorrecta": no se debe poder
// distinguir un correo registrado de uno que no lo está.
function credencialesInvalidas() {
  return NextResponse.json(
    { success: false, error: 'Credenciales inválidas' },
    { status: 401 },
  );
}

function demasiadosIntentos(resetAt) {
  return NextResponse.json(
    { success: false, error: 'Demasiados intentos de inicio de sesión. Espera unos minutos.' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } },
  );
}

export async function POST(request) {
  let client;

  const rlIp = rateLimit(request, { scope: 'login', ...LIMITE_POR_IP });
  if (!rlIp.allowed) return demasiadosIntentos(rlIp.resetAt);

  try {
    const { correo_electronico, contrasena } = await request.json();

    if (
      !correo_electronico || typeof correo_electronico !== 'string' ||
      !contrasena || typeof contrasena !== 'string'
    ) {
      return credencialesInvalidas();
    }

    // El registro guarda el correo ya normalizado (zod: .trim().toLowerCase()),
    // así que buscarlo tal cual lo tecleó el usuario fallaba en cuanto el móvil
    // autocapitalizaba la primera letra: la cuenta existía y el login decía
    // "credenciales inválidas". La misma clave normalizada se usa en el rate
    // limit por cuenta para que cambiar mayúsculas no regale intentos extra.
    const emailNormalizado = correo_electronico.trim().toLowerCase();

    const rlCuenta = rateLimit(request, {
      key: `login:cuenta:${emailNormalizado}`,
      ...LIMITE_POR_CUENTA,
    });
    if (!rlCuenta.allowed) return demasiadosIntentos(rlCuenta.resetAt);

    try {
      client = await connectWithRetry();
    } catch (connectionError) {
      console.error('💥 Error de conexión en /api/auth/login:', connectionError);
      return NextResponse.json(
        { success: false, error: 'No se pudo conectar con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }

    let userData = null;

    try {
      // Dar de baja a un miembro desde el panel es un borrado LÓGICO
      // (estado='baja' + deleted_at). Sin este filtro, "eliminar" a alguien no
      // le quitaba el acceso y, si era administrador, recuperaba el panel
      // entero al volver a entrar.
      // Se filtra por estado <> 'baja' y no por estado = 'activo': 'inactivo' y
      // 'egresado' son miembros que siguen teniendo cuenta.
      const result = await client.query(`
        SELECT
          id_miembro,
          nombre,
          apellido_paterno,
          correo_electronico,
          contrasena,
          rol
        FROM miembro
        WHERE correo_electronico = $1
          AND deleted_at IS NULL
          AND estado <> 'baja'
        LIMIT 1
      `, [emailNormalizado]);

      userData = result.rows[0] || null;
    } catch (dbError) {
      console.error('💥 Error de base de datos en login:', dbError);

      // Manejo específico de errores de conexión
      if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(dbError.code)) {
        return NextResponse.json(
          { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { success: false, error: 'Error al verificar credenciales' },
        { status: 500 }
      );
    } finally {
      if (client) client.release();
    }

    const passwordMatch = await bcrypt.compare(
      contrasena,
      userData?.contrasena || DUMMY_HASH,
    );

    if (!userData || !passwordMatch) {
      return credencialesInvalidas();
    }

    // Rol viene siempre de la base de datos. No hay fallback por email.
    const normalizedRole = userData.rol || 'usuario';

    const nombreCompleto = `${userData.nombre} ${userData.apellido_paterno}`.trim();

    const token = await createToken({
      id: userData.id_miembro,
      email: userData.correo_electronico,
      name: nombreCompleto,
      role: normalizedRole
    });

    const response = NextResponse.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      user: {
        id: userData.id_miembro,
        name: nombreCompleto,
        email: userData.correo_electronico,
        role: normalizedRole
      },
      redirectTo: normalizedRole === 'administrador' ? '/admin' : '/dashboard'
    });

    // Los atributos viven en COOKIE_SESION para que login y logout no puedan
    // divergir (ver src/lib/auth.js).
    response.cookies.set({
      ...COOKIE_SESION,
      value: token,
      maxAge: DURACION_SESION_SEGUNDOS,
    });

    return response;
  } catch (error) {
    console.error('💥 Error en login:', error);

    // Manejo específico de errores de conexión
    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { success: false, error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Error en el inicio de sesión' },
      { status: 500 }
    );
  }
}
