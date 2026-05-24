import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';

export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        e.id_evento,
        e.nombre,
        e.descripcion_html,
        e.fecha_inicio,
        e.fecha_fin,
        TO_CHAR(e.fecha_limite_registro, 'YYYY-MM-DD"T"HH24:MI') as fecha_limite_registro,
        e.hora_inicio,
        e.hora_fin,
        e.ubicacion,
        e.cupos,
        e.cupos_disponibles,
        e.tiene_costo,
        e.costo,
        e.imagen_flyer_url,
        e.estado,
        t.id_tipo_evento,
        t.nombre as tipo_nombre,
        a.id_alcance,
        a.nombre as alcance_nombre,
        (
          SELECT COUNT(*) FROM inscripcion_evento
          WHERE id_evento = e.id_evento AND estado <> 'cancelada'
        ) as total_inscritos,
        -- Datos de concurso si aplica
        c.id_concurso,
        c.modalidad,
        c.max_integrantes_equipo,
        c.min_integrantes_equipo,
        c.id_plataforma,
        c.requiere_asesor,
        c.url_concurso,
        cp.nombre as plataforma_nombre
      FROM evento e
      JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
      JOIN catalogo_alcance_evento a ON e.id_alcance = a.id_alcance
      LEFT JOIN concurso c ON e.id_evento = c.id_evento
      LEFT JOIN catalogo_plataforma cp ON c.id_plataforma = cp.id_plataforma
      WHERE e.deleted_at IS NULL
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
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const client = await pool.connect();
  try {
    const body = await request.json();
    const {
      nombre,
      descripcion_html,
      id_tipo_evento,
      id_alcance,
      fecha_inicio,
      fecha_fin,
      fecha_limite_registro,
      hora_inicio,
      hora_fin,
      ubicacion,
      cupos,
      tiene_costo,
      costo,
      imagen_flyer_url,
      imagen_flyer_key,
      // Datos de concurso
      es_concurso,
      modalidad, // 'individual' | 'equipos'
      max_integrantes_equipo,
      min_integrantes_equipo,
      id_plataforma,
      requiere_asesor,
      url_concurso
    } = body;

    // Validaciones básicas. La DB exige fecha_fin/hora_fin NOT NULL y cupos > 0.
    if (!nombre || !id_tipo_evento || !id_alcance || !fecha_inicio || !hora_inicio || !hora_fin) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      );
    }
    if (es_concurso && modalidad && !['individual', 'equipos'].includes(modalidad)) {
      return NextResponse.json(
        { error: "modalidad debe ser 'individual' o 'equipos'" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(parseInt(cupos)) || parseInt(cupos) <= 0) {
      return NextResponse.json({ error: 'Los cupos deben ser mayores a 0' }, { status: 400 });
    }

    await client.query('BEGIN');

    // 1. Insertar Evento
    const insertEventoQuery = `
      INSERT INTO evento (
        nombre, descripcion_html, id_tipo_evento, id_alcance,
        fecha_inicio, fecha_fin, fecha_limite_registro, hora_inicio, hora_fin,
        ubicacion, cupos, cupos_disponibles,
        tiene_costo, costo,
        imagen_flyer_url, imagen_flyer_key,
        estado
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        $10, $11, $11, -- cupos_disponibles inicial = cupos
        $12, $13,
        $14, $15,
        'publicado'
      )
      RETURNING id_evento;
    `;

    const fechaFinValue = fecha_fin || fecha_inicio;
    const costoValue = parseFloat(costo) || 0;
    const tieneCostoValue = tiene_costo || (costoValue > 0);

    const eventoRes = await client.query(insertEventoQuery, [
      nombre,
      sanitizeHtml(descripcion_html || ''),
      id_tipo_evento,
      id_alcance,
      fecha_inicio,
      fechaFinValue,
      fecha_limite_registro || null,
      hora_inicio,
      hora_fin,
      ubicacion ?? null,
      parseInt(cupos),
      tieneCostoValue,
      costoValue,
      imagen_flyer_url,
      imagen_flyer_key
    ]);

    const idEvento = eventoRes.rows[0].id_evento;

    // 2. Insertar Concurso si aplica
    if (es_concurso) {
      // Valor por defecto para equipos: mínimo 2 personas, o lo que venga del front
      const minIntegrantes = modalidad === 'equipos' ? (parseInt(min_integrantes_equipo) || 2) : 1; 
      
      const insertConcursoQuery = `
        INSERT INTO concurso (
          id_evento, id_plataforma, modalidad, 
          max_integrantes_equipo, min_integrantes_equipo, requiere_asesor, url_concurso
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        )
      `;
      
      await client.query(insertConcursoQuery, [
        idEvento,
        id_plataforma || null,
        modalidad || 'individual',
        modalidad === 'equipos' ? (parseInt(max_integrantes_equipo) || 3) : null,
        minIntegrantes,
        requiere_asesor || false,
        url_concurso
      ]);
    }

    await client.query('COMMIT');

    return NextResponse.json({ 
      message: 'Evento creado exitosamente',
      id_evento: idEvento 
    }, { status: 201 });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en POST /api/admin/eventos:', error);
    // Mapear violaciones de CHECK/FK a 400 con mensaje claro.
    if (error.code === '23514') {
      const c = error.constraint || '';
      let msg = 'Datos del evento inválidos.';
      if (c.includes('costo')) msg = 'Si el evento tiene costo, el costo debe ser mayor a 0 (y 0 si no tiene costo).';
      else if (c.includes('cupos')) msg = 'Los cupos deben ser mayores a 0.';
      else if (c.includes('fecha')) msg = 'La fecha de fin debe ser igual o posterior a la de inicio.';
      else if (c.includes('hora')) msg = 'En eventos de un mismo día, la hora de fin debe ser posterior a la de inicio.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (error.code === '23503') {
      return NextResponse.json({ error: 'Tipo de evento, alcance o plataforma inválidos.' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Error al crear evento: ' + error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
