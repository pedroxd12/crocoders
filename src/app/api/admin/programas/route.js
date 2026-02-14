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
      imagen_url,
      dias_semana, // Array de números [1, 3, 5] (Lunes, Miércoles, Viernes)
      hora_inicio,
      hora_fin
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

    const programaId = result.rows[0].id_programa;

    // Generar sesiones si se seleccionaron días
    if (dias_semana && dias_semana.length > 0 && hora_inicio && hora_fin) {
      const start = new Date(fecha_inicio + 'T00:00:00');
      const end = new Date(fecha_fin + 'T00:00:00');
      
      // Iterar por cada día en el rango
      let sessionCount = 1;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (dias_semana.includes(d.getDay())) {
          const fechaStr = d.toISOString().split('T')[0];
          
          // 1. Crear evento para esta sesión
          const eventoRes = await client.query(
            `INSERT INTO evento (
               nombre, descripcion_html, id_tipo_evento, id_alcance,
               fecha_inicio, hora_inicio, fecha_fin, hora_fin,
               ubicacion, estado, cupos, cupos_disponibles, 
               imagen_flyer_url, tiene_costo
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'publicado', 100, 100, $10, false)
             RETURNING id_evento`,
            [
              `${nombre} - Sesión ${sessionCount}`, // Nombre del evento
              descripcion,
              id_tipo_evento,
              id_alcance,
              fechaStr,
              hora_inicio,
              fechaStr, // Asumimos sesiones de un solo día
              hora_fin,
              ubicacion,
              imagen_url
            ]
          );
          
          const eventoId = eventoRes.rows[0].id_evento;

          // 2. Crear registro en sesion_programa
          await client.query(
            `INSERT INTO sesion_programa (
              id_programa, id_evento, numero_sesion, titulo, descripcion
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
              programaId,
              eventoId,
              sessionCount,
              `Sesión ${sessionCount}: ${nombre}`,
              descripcion
            ]
          );
          
          sessionCount++;
        }
      }
    }

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
