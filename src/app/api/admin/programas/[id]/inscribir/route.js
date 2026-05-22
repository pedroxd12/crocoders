import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

// POST - Inscribir usuario a un programa
export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const client = await pool.connect();
  
  try {
    const { id_miembro, id_invitado } = await request.json();

    // Validar que se proporcione uno y solo uno
    if ((!id_miembro && !id_invitado) || (id_miembro && id_invitado)) {
      return NextResponse.json(
        { error: 'Debe proporcionar id_miembro o id_invitado, pero no ambos' },
        { status: 400 }
      );
    }

    const programaCheck = await client.query(
      'SELECT id_programa FROM programa_recurrente WHERE id_programa = $1',
      [id],
    );

    if (programaCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Programa no encontrado' },
        { status: 404 },
      );
    }

    const result = await client.query(
      `INSERT INTO inscripcion_programa (id_programa, id_miembro, id_invitado)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, id_miembro || null, id_invitado || null]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Error inscribing to programa:', error);
    if (error.code === '23505') { // Unique violation
      return NextResponse.json(
        { error: 'El usuario ya está inscrito en este programa' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Error al inscribir usuario' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
