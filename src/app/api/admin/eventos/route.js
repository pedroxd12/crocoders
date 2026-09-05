import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';
import { sqlLugaresOcupados, sqlCupoPorRetos } from '@/lib/eventos-cupos';
import { normalizarEvento, EventoInvalido, mensajeErrorEvento } from '@/lib/eventos-validacion';

export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const client = await connectWithRetry();
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
        e.instrucciones_pago,
        e.imagen_flyer_url,
        e.estado,
        e.solicitar_talla,
        e.asignar_mesas,
        e.resultados_publicados,
        e.slug,
        -- Retos del evento: el panel necesita saber si tiene y cuántos para
        -- llevar al gestor de desafíos sin abrir la pantalla en vacío.
        (SELECT COUNT(*)::int FROM reto_evento r WHERE r.id_evento = e.id_evento) as total_retos,
        (SELECT COUNT(*)::int FROM ganador_evento g WHERE g.id_evento = e.id_evento) as total_ganadores,
        t.id_tipo_evento,
        t.nombre as tipo_nombre,
        t.permite_equipos,
        a.id_alcance,
        a.nombre as alcance_nombre,
        -- Inscripciones vivas en la UNIDAD del aforo: equipos en concursos por
        -- equipos, personas en el resto (src/lib/aforo.js). Es la misma cifra
        -- que compara el registro contra e.cupos.
        ${sqlLugaresOcupados('e')} as lugares_ocupados,
        -- Aforo dictado por los desafíos (NULL si no aplica).
        ${sqlCupoPorRetos('e')} as cupo_por_retos,
        -- Datos de concurso si aplica
        c.id_concurso,
        c.modalidad,
        c.max_integrantes_equipo,
        c.min_integrantes_equipo,
        c.id_plataforma,
        c.requiere_asesor,
        c.asesor_participa,
        c.max_asesores,
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    // El tipo decide si la modalidad por equipos es válida: se lee del
    // catálogo ANTES de validar (un Taller no puede inscribirse por equipos).
    const idTipo = parseInt(body?.id_tipo_evento, 10);
    const tipoRes = Number.isInteger(idTipo)
      ? await client.query('SELECT nombre, permite_equipos FROM catalogo_tipo_evento WHERE id_tipo_evento = $1', [idTipo])
      : { rows: [] };
    if (tipoRes.rows.length === 0) {
      return NextResponse.json({ error: 'Elige un tipo de evento válido.' }, { status: 400 });
    }

    const { evento, concurso } = normalizarEvento(body, { tipo: tipoRes.rows[0], esEdicion: false });

    await client.query('BEGIN');

    // 1. Insertar Evento. `cupos_disponibles` arranca igual que `cupos` (el
    //    trigger de la base lo haría con NULL, pero así queda explícito).
    const eventoRes = await client.query(
      `INSERT INTO evento (
         nombre, descripcion_html, id_tipo_evento, id_alcance,
         fecha_inicio, fecha_fin, fecha_limite_registro, hora_inicio, hora_fin,
         ubicacion, cupos, cupos_disponibles,
         tiene_costo, costo,
         imagen_flyer_url, imagen_flyer_key,
         solicitar_talla, asignar_mesas,
         instrucciones_pago,
         slug,
         estado
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8, $9,
         $10, $11, $11,
         $12, $13,
         $14, $15,
         $16, $17, $18, $19, $20
       )
       RETURNING id_evento`,
      [
        evento.nombre,
        sanitizeHtml(evento.descripcion_html || ''),
        evento.id_tipo_evento,
        evento.id_alcance,
        evento.fecha_inicio,
        evento.fecha_fin,
        evento.fecha_limite_registro,
        evento.hora_inicio,
        evento.hora_fin,
        evento.ubicacion,
        evento.cupos,
        evento.tiene_costo,
        evento.costo,
        body.imagen_flyer_url || null,
        body.imagen_flyer_key || null,
        evento.solicitar_talla,
        evento.asignar_mesas,
        evento.instrucciones_pago,
        evento.slug ?? null,
        evento.estado,
      ],
    );

    const idEvento = eventoRes.rows[0].id_evento;

    // 2. Insertar Concurso si aplica
    if (concurso) {
      await client.query(
        `INSERT INTO concurso (
           id_evento, id_plataforma, modalidad,
           max_integrantes_equipo, min_integrantes_equipo, requiere_asesor,
           asesor_participa, max_asesores, url_concurso
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          idEvento,
          concurso.id_plataforma,
          concurso.modalidad,
          concurso.max_integrantes_equipo,
          concurso.min_integrantes_equipo,
          concurso.requiere_asesor,
          concurso.asesor_participa,
          concurso.max_asesores,
          concurso.url_concurso,
        ],
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      message: 'Evento creado exitosamente',
      id_evento: idEvento
    }, { status: 201 });

  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    if (error instanceof EventoInvalido) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error en POST /api/admin/eventos:', error);
    const mensaje = mensajeErrorEvento(error);
    if (mensaje) {
      return NextResponse.json({ error: mensaje }, { status: error.code === '23505' ? 409 : 400 });
    }
    return NextResponse.json(
      { error: 'Error al crear evento' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
