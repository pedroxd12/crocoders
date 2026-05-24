// src/app/api/invitados/route.js
// Alta pública de invitados (externos sin cuenta) para el registro a eventos.
// Es upsert por correo: si el invitado ya existe, refresca sus datos y reusa
// su id_invitado en vez de acumular duplicados.
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { invitadoSchema, parseOrError } from '@/lib/validation';

export async function POST(request) {
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

  try {
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
        nombre_completo     = EXCLUDED.nombre_completo,
        numero_telefono     = COALESCE(EXCLUDED.numero_telefono, invitado.numero_telefono),
        escuela_institucion = COALESCE(EXCLUDED.escuela_institucion, invitado.escuela_institucion),
        carrera             = COALESCE(EXCLUDED.carrera, invitado.carrera),
        semestre            = COALESCE(EXCLUDED.semestre, invitado.semestre),
        updated_at          = NOW()
      RETURNING id_invitado
    `;

    return NextResponse.json({ id_invitado: rows[0].id_invitado });
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
