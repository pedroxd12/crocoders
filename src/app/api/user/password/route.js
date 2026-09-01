import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import bcrypt from 'bcryptjs';
import { requireAuth } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export async function PUT(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = Number(auth.session.id);

  // Con una sesión válida se podía probar la contraseña actual tantas veces
  // como se quisiera (bcrypt.compare más abajo). Cinco intentos por cuarto de
  // hora bastan para un cambio legítimo y cierran ese oráculo.
  const rl = rateLimit(request, {
    scope: 'password-change',
    key: `password-change:${userId}`,
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
      { status: 429 },
    );
  }

  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Se requieren ambas contraseñas' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      );
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        { success: false, error: 'La nueva contraseña debe ser distinta de la actual' },
        { status: 400 }
      );
    }

    // Obtener contraseña actual
    const user = await sql`
      SELECT contrasena FROM miembro WHERE id_miembro = ${userId}
    `;

    if (!user || user.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    // Verificar contraseña actual
    const validPassword = await bcrypt.compare(currentPassword, user[0].contrasena);
    if (!validPassword) {
      return NextResponse.json(
        { success: false, error: 'La contraseña actual es incorrecta' },
        { status: 400 }
      );
    }

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Actualizar contraseña
    await sql`
      UPDATE miembro
      SET contrasena = ${hashedPassword},
          updated_at = NOW()
      WHERE id_miembro = ${userId}
    `;

    return NextResponse.json({
      success: true,
      // Aviso honesto: el JWT es autocontenido y dura 7 días, así que cambiar
      // la contraseña NO expulsa a las sesiones ya abiertas en otros
      // dispositivos. Hacerlo requiere una columna de versión de token en
      // `miembro` que hoy no existe.
      message: 'Contraseña actualizada correctamente. Las sesiones abiertas en otros dispositivos seguirán activas hasta que caduquen.',
    });
  } catch (error) {
    console.error('Error en cambio de contraseña:', error);
    return NextResponse.json(
      { success: false, error: 'Error al cambiar la contraseña' },
      { status: 500 }
    );
  }
}
