import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';

// GET - Obtener detalles de un programa
export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT 
        pr.*,
        te.nombre as tipo_evento,
        ae.nombre as alcance,
        COUNT(DISTINCT sp.id_sesion) as total_sesiones,
        COUNT(DISTINCT ip.id_inscripcion_programa) as total_inscritos
      FROM programa_recurrente pr
      LEFT JOIN catalogo_tipo_evento te ON pr.id_tipo_evento = te.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento ae ON pr.id_alcance = ae.id_alcance
      LEFT JOIN sesion_programa sp ON pr.id_programa = sp.id_programa
      LEFT JOIN inscripcion_programa ip ON pr.id_programa = ip.id_programa
      WHERE pr.id_programa = $1
      GROUP BY pr.id_programa, te.nombre, ae.nombre`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Programa no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching programa:', error);
    return NextResponse.json(
      { error: 'Error al obtener programa' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// PUT - Actualizar programa
export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const client = await pool.connect();
  
  try {
    const {
      nombre,
      descripcion,
      fecha_inicio,
      fecha_fin,
      id_tipo_evento,
      id_alcance,
      sesiones_requeridas_certificado,
      porcentaje_asistencia_minimo,
      ubicacion,
      imagen_url,
      activo,
    } = await request.json();

    // Validación de campos obligatorios (NOT NULL en el schema).
    if (!nombre || !fecha_inicio || !fecha_fin || !id_tipo_evento || !id_alcance) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    // Respetar un 0 explícito en el porcentaje (no caer a 80).
    const pctMin = (porcentaje_asistencia_minimo === undefined || porcentaje_asistencia_minimo === null || porcentaje_asistencia_minimo === '')
      ? 80.0 : Number(porcentaje_asistencia_minimo);

    const result = await client.query(
      `UPDATE programa_recurrente SET
        nombre = $1,
        descripcion = $2,
        fecha_inicio = $3,
        fecha_fin = $4,
        id_tipo_evento = $5,
        id_alcance = $6,
        sesiones_requeridas_certificado = $7,
        porcentaje_asistencia_minimo = $8,
        ubicacion = $9,
        imagen_url = $10,
        activo = COALESCE($11, activo),
        updated_at = NOW()
      WHERE id_programa = $12
      RETURNING *`,
      [
        nombre,
        descripcion ?? null,
        fecha_inicio,
        fecha_fin,
        id_tipo_evento,
        id_alcance,
        Number.isFinite(Number(sesiones_requeridas_certificado)) ? Number(sesiones_requeridas_certificado) : 0,
        pctMin,
        ubicacion ?? null,
        imagen_url ?? null,
        typeof activo === 'boolean' ? activo : null,
        id,
      ],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Programa no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating programa:', error);
    if (error.code === '23503') {
      return NextResponse.json({ error: 'Tipo de evento o alcance inválido' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Error al actualizar programa' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// DELETE - Eliminar programa
export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const client = await pool.connect();
  
  try {
    // Por la cascada, esto eliminará automáticamente sesiones e inscripciones
    const result = await client.query(
      'DELETE FROM programa_recurrente WHERE id_programa = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Programa no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Programa eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting programa:', error);
    return NextResponse.json(
      { error: 'Error al eliminar programa' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
