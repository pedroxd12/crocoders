import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

// GET - Listar todos los programas recurrentes
export async function GET() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
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
      GROUP BY pr.id_programa, te.nombre, ae.nombre
      ORDER BY pr.fecha_inicio DESC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching programas:', error);
    return NextResponse.json(
      { error: 'Error al obtener programas' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// POST - Crear nuevo programa
export async function POST(request) {
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
      imagen_url
    } = await request.json();

    // Validaciones
    if (!nombre || !fecha_inicio || !fecha_fin || !id_tipo_evento || !id_alcance) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    const result = await client.query(
      `INSERT INTO programa_recurrente (
        nombre, descripcion, fecha_inicio, fecha_fin,
        id_tipo_evento, id_alcance, sesiones_requeridas_certificado,
        porcentaje_asistencia_minimo, ubicacion, imagen_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        nombre,
        descripcion,
        fecha_inicio,
        fecha_fin,
        id_tipo_evento,
        id_alcance,
        sesiones_requeridas_certificado || 0,
        porcentaje_asistencia_minimo || 80.00,
        ubicacion,
        imagen_url
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Error creating programa:', error);
    return NextResponse.json(
      { error: 'Error al crear programa' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
