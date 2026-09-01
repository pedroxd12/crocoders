// src/app/api/invitados/route.js
// Alta pública de invitados (externos sin cuenta) para el registro a eventos.
// Es upsert por correo: si el invitado ya existe, RELLENA los huecos de su ficha
// y reusa su id_invitado en vez de acumular duplicados. Nunca pisa datos ya
// guardados: el endpoint es público, así que sobrescribir el nombre permitía a
// cualquiera falsificar la identidad de otra persona en las listas de asistencia.
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { invitadoSchema, parseOrError } from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { firmarInvitado } from '@/lib/invitado-token';

export async function POST(request) {
  // Endpoint público sin auth: limitar para evitar alta masiva de invitados.
  const rl = rateLimit(request, { scope: 'invitados', limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' },
      { status: 429 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  const [data, errPayload] = parseOrError(invitadoSchema, body);
  if (errPayload) {
    // Mismo contrato que el resto de endpoints: { error } para el frontend.
    return NextResponse.json({ error: errPayload.error, issues: errPayload.issues }, { status: 400 });
  }

  const {
    nombre_completo,
    correo_electronico,
    numero_telefono,
    escuela_institucion,
    carrera,
    semestre,
  } = data;

  // Fail-fast del secreto ANTES de escribir: sin él no podríamos emitir el
  // guestToken y dejaríamos la fila creada pero al usuario sin poder continuar.
  if (!process.env.PAYLOAD_SECRET) {
    console.error('PAYLOAD_SECRET no configurado: no se puede emitir la credencial del invitado.');
    return NextResponse.json(
      { error: 'El servidor no está configurado para el registro de invitados. Contacta al administrador.' },
      { status: 500 },
    );
  }

  // Segundo límite, esta vez por CORREO y no por IP: rotar de IP era gratis y
  // permitía martillear la ficha de una misma persona.
  const rlCorreo = rateLimit(request, {
    key: `invitados:${correo_electronico}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rlCorreo.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes para este correo. Intenta de nuevo más tarde.' },
      { status: 429 },
    );
  }

  try {
    // Si el correo ya pertenece a una cuenta de miembro, no creamos una segunda
    // identidad de la misma persona: acabaría inscrita dos veces al mismo evento
    // (una como miembro y otra como invitada) inflando los conteos.
    const miembros = await sql`
      SELECT 1 FROM miembro
       WHERE LOWER(correo_electronico) = ${correo_electronico} AND deleted_at IS NULL
       LIMIT 1
    `;
    if (miembros.length > 0) {
      return NextResponse.json(
        { error: 'Ese correo pertenece a una cuenta registrada. Inicia sesión para inscribirte.' },
        { status: 409 },
      );
    }

    const rows = await sql`
      INSERT INTO invitado (nombre_completo, correo_electronico, numero_telefono, escuela_institucion, carrera, semestre)
      VALUES (
        ${nombre_completo},
        ${correo_electronico},
        ${numero_telefono || null},
        ${escuela_institucion || null},
        ${carrera || null},
        ${semestre ?? null}
      )
      ON CONFLICT (correo_electronico) DO UPDATE SET
        -- El nombre NO se sobrescribe: sólo se rellena si estaba vacío. Es la
        -- identidad que sale en listas de asistencia y certificados.
        nombre_completo     = COALESCE(invitado.nombre_completo, EXCLUDED.nombre_completo),
        numero_telefono     = COALESCE(invitado.numero_telefono, EXCLUDED.numero_telefono),
        escuela_institucion = COALESCE(invitado.escuela_institucion, EXCLUDED.escuela_institucion),
        carrera             = COALESCE(invitado.carrera, EXCLUDED.carrera),
        semestre            = COALESCE(invitado.semestre, EXCLUDED.semestre),
        updated_at          = NOW()
      RETURNING id_invitado
    `;

    const idInvitado = rows[0].id_invitado;

    // `guestToken`: credencial firmada que ata este id_invitado a quien acaba de
    // demostrar que conoce el correo. Es lo único que acepta
    // POST /api/eventos/register para inscribir a un invitado.
    return NextResponse.json({
      id_invitado: idInvitado,
      guestToken: firmarInvitado(idInvitado),
    });
  } catch (error) {
    console.error('Error en POST /api/invitados:', error);
    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Error al registrar los datos del invitado' }, { status: 500 });
  }
}
