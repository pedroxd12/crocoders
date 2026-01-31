import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

export async function GET() {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        e.id_evento,
        e.nombre as nombre_evento,
        e.descripcion_html as descripcion,
        t.nombre as tipo,
        a.nombre as hermandad, 
        e.fecha_inicio as fecha,
        e.hora_inicio,
        e.hora_fin,
        e.fecha_fin,
        e.cupos,
        e.cupos_disponibles,
        e.costo,
        e.ubicacion,
        e.imagen_flyer_url as imagen_url,
        e.imagen_flyer_key as imagen_key,
        e.estado,
        (
          SELECT COUNT(*) FROM inscripcion_evento 
          WHERE id_evento = e.id_evento
        ) as asistentes_count
      FROM evento e
      JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
      JOIN catalogo_alcance_evento a ON e.id_alcance = a.id_alcance
      ORDER BY e.fecha_inicio DESC, e.hora_inicio DESC
    `;
    const result = await client.query(query);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error en GET /api/admin/eventos:', error);
    return NextResponse.json(
      { error: 'Error al obtener eventos' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function POST(request) {
  const client = await pool.connect();
  try {
    const formData = await request.json();
    
    const requiredFields = ['nombre_evento', 'descripcion', 'tipo', 'fecha', 'hora_inicio', 'hora_fin'];
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Faltan campos requeridos: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // 1. Obtener ID Tipo Evento
    const tipoRes = await client.query(
      'SELECT id_tipo_evento FROM catalogo_tipo_evento WHERE nombre ILIKE $1',
      [formData.tipo]
    );
    let idTipoEvento;
    if (tipoRes.rows.length > 0) {
        idTipoEvento = tipoRes.rows[0].id_tipo_evento;
    } else {
        // Fallback o error. Para robustez, buscaremos 'Conferencia' por defecto o crearemos error
        const defaultTipo = await client.query("SELECT id_tipo_evento FROM catalogo_tipo_evento LIMIT 1");
        idTipoEvento = defaultTipo.rows[0].id_tipo_evento;
    }

    // 2. Obtener ID Alcance (Hermandad)
    let alcanceNombre = formData.hermandad || 'Abierto';
    // Mapeo simple de lo que enviaba el frontend viejo a lo nuevo
    if (alcanceNombre.toLowerCase().includes('club')) alcanceNombre = 'Solo Club de Programación';
    else if (alcanceNombre.toLowerCase().includes('society')) alcanceNombre = 'Solo Computer Society';
    else if (alcanceNombre.toLowerCase().includes('tecnológico')) alcanceNombre = 'Solo Tecnológico';
    else alcanceNombre = 'Abierto';

    const alcanceRes = await client.query(
      'SELECT id_alcance FROM catalogo_alcance_evento WHERE nombre ILIKE $1',
      [alcanceNombre]
    );
    let idAlcance;
    if (alcanceRes.rows.length > 0) {
        idAlcance = alcanceRes.rows[0].id_alcance;
    } else {
        const defaultAlcance = await client.query("SELECT id_alcance FROM catalogo_alcance_evento WHERE nombre = 'Abierto'");
        idAlcance = defaultAlcance.rows[0].id_alcance;
    }

    const { 
        nombre_evento, descripcion, fecha, hora_inicio, hora_fin, 
        cupos, costo, imagen_url, imagen_key, ubicacion 
    } = formData;

    // Insertar Evento
    const insertQuery = `
      INSERT INTO evento 
        (nombre, descripcion_html, id_tipo_evento, id_alcance, fecha_inicio, fecha_fin, hora_inicio, hora_fin, cupos, cupos_disponibles, costo, imagen_flyer_url, imagen_flyer_key, ubicacion, estado)
      VALUES
        ($1, $2, $3, $4, $5, $5, $6, $7, $8, $8, $9, $10, $11, $12, 'publicado')
      RETURNING id_evento, nombre
    `;
    
    // Asumimos fecha_fin = fecha_inicio para simplificar ya que el frontend envía solo 'fecha'
    // cupos_disponibles = cupos (inicialmente)

    const result = await client.query(insertQuery, [
        nombre_evento,
        descripcion,
        idTipoEvento,
        idAlcance,
        fecha,
        hora_inicio,
        hora_fin,
        parseInt(cupos) || 0,
        parseFloat(costo) || 0,
        imagen_url,
        imagen_key,
        ubicacion || ''
    ]);

    await client.query('COMMIT');
    return NextResponse.json(result.rows[0], { status: 201 });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en POST /api/admin/eventos:', error);
    return NextResponse.json(
      { error: 'Error al crear evento: ' + error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
