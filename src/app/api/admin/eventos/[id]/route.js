import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';
import { recalcularCupos, sqlLugaresOcupados, sqlCupoPorRetos } from '@/lib/eventos-cupos';
import { normalizarEvento, EventoInvalido, mensajeErrorEvento } from '@/lib/eventos-validacion';
import { deleteFromUploadThing } from '@/lib/uploadthing-server';

export async function GET(request, context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;

  // La validación va ANTES de pedir conexión: al revés, un id inválido salía por
  // el return de abajo sin pasar por el `finally`, y esa conexión del pool se
  // quedaba colgada hasta el timeout (el pool de Railway es pequeño).
  if (!id || isNaN(Number(id))) {
      return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  const client = await connectWithRetry();

  try {
    // Basic event info + counts
    const query = `
      SELECT
        e.*,
        -- Va DESPUÉS de e.* a propósito: al repetirse el nombre de columna, este
        -- valor es el que queda en la fila. La columna es 'timestamp without
        -- time zone' y guarda hora de pared de México, así que se devuelve como
        -- cadena naive lista para el <input datetime-local> del panel, sin pasar
        -- por Date (que la reinterpretaba en la zona del servidor).
        TO_CHAR(e.fecha_limite_registro, 'YYYY-MM-DD"T"HH24:MI') as fecha_limite_registro,
        t.nombre as tipo_nombre,
        -- El registro manual de asistentes necesita saber si el evento es por
        -- equipos: son las mismas tres condiciones del detalle público
        -- (permite_equipos && id_concurso && modalidad = 'equipos').
        t.permite_equipos,
        a.nombre as alcance_nombre,
        -- Desafíos del evento (migración 014): la ficha del panel los muestra.
        (SELECT COUNT(*)::int FROM reto_evento r WHERE r.id_evento = e.id_evento) as total_retos,
        (SELECT COUNT(*)::int FROM reto_evento r WHERE r.id_evento = e.id_evento AND r.activo) as total_retos_activos,
        (SELECT COUNT(*)::int FROM ganador_evento g WHERE g.id_evento = e.id_evento) as total_ganadores,
        (SELECT COUNT(*)::int FROM plantilla_documento p WHERE p.id_evento = e.id_evento) as total_plantillas,
        -- Concurso info
        c.id_concurso,
        c.modalidad,
        c.max_integrantes_equipo,
        c.min_integrantes_equipo,
        c.id_plataforma,
        c.requiere_asesor,
        c.asesor_participa,
        c.max_asesores,
        c.url_concurso,
        -- Inscripciones vivas en la UNIDAD del aforo (equipos o personas).
        ${sqlLugaresOcupados('e')} as total_inscritos,
        ${sqlLugaresOcupados('e')} as lugares_ocupados,
        -- Aforo dictado por los desafíos: si no es NULL, el formulario muestra
        -- el campo de cupos como derivado (src/lib/eventos-cupos.js).
        ${sqlCupoPorRetos('e')} as cupo_por_retos
      FROM evento e
      LEFT JOIN catalogo_tipo_evento t ON e.id_tipo_evento = t.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento a ON e.id_alcance = a.id_alcance
      LEFT JOIN concurso c ON e.id_evento = c.id_evento
      WHERE e.id_evento = $1 AND e.deleted_at IS NULL
    `;

    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    // `fecha_limite_registro` ya viene formateada desde SQL: no se reconstruye
    // en JS con getHours(), que dependía de la zona horaria del servidor.
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error en GET /api/admin/eventos/[id]:', error);
    return NextResponse.json({ error: 'Error al obtener evento' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(request, context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;

  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  let client;
  try {
    client = await connectWithRetry();

    const idTipo = parseInt(body?.id_tipo_evento, 10);
    const tipoRes = Number.isInteger(idTipo)
      ? await client.query('SELECT nombre, permite_equipos FROM catalogo_tipo_evento WHERE id_tipo_evento = $1', [idTipo])
      : { rows: [] };
    if (tipoRes.rows.length === 0) {
      return NextResponse.json({ error: 'Elige un tipo de evento válido.' }, { status: 400 });
    }

    const { evento, concurso } = normalizarEvento(body, { tipo: tipoRes.rows[0], esEdicion: true });

    await client.query('BEGIN');

    // 1. Bloquear el evento y leer estado actual (imagen, cupos, slug, estado).
    const currentRes = await client.query(
      `SELECT imagen_flyer_url, imagen_flyer_key, cupos AS cupos_actual, cupos_disponibles,
              slug AS slug_actual, estado AS estado_actual
         FROM evento WHERE id_evento = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    if (currentRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const actual = currentRes.rows[0];

    // Si la propiedad no viene en el body, conservar el valor actual. Solo se
    // toca cuando el cliente envía explícitamente la propiedad (incluso como null
    // para indicar borrado).
    const hasKeyField = Object.prototype.hasOwnProperty.call(body, 'imagen_flyer_key');
    const hasUrlField = Object.prototype.hasOwnProperty.call(body, 'imagen_flyer_url');

    let finalKey = actual.imagen_flyer_key;
    let finalUrl = actual.imagen_flyer_url;
    // El borrado en el CDN se difiere a DESPUÉS del COMMIT: si la transacción
    // hiciera ROLLBACK, no queremos haber borrado un archivo aún referenciado.
    let keyToDeleteAfterCommit = null;

    if (hasKeyField) {
      finalKey = body.imagen_flyer_key ?? null;
      if (actual.imagen_flyer_key && actual.imagen_flyer_key !== finalKey) {
        keyToDeleteAfterCommit = actual.imagen_flyer_key;
      }
    }
    if (hasUrlField) {
      finalUrl = body.imagen_flyer_url ?? null;
    }

    // 2. Cambio de modalidad con inscripciones dentro. Pasar de equipos a
    //    individual dejaría equipos inscritos en un evento que ya no los admite
    //    (y al revés). Se rechaza con un mensaje claro en vez de dejar datos
    //    incoherentes.
    const inscRes = await client.query(
      `SELECT COUNT(*) FILTER (WHERE id_equipo IS NOT NULL)::int AS equipos,
              COUNT(*) FILTER (WHERE id_equipo IS NULL)::int AS individuales
         FROM inscripcion_evento WHERE id_evento = $1 AND estado <> 'cancelada'`,
      [id],
    );
    const { equipos: equiposVivos, individuales: individualesVivos } = inscRes.rows[0];
    if (concurso?.modalidad === 'equipos' && individualesVivos > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: `No se puede cambiar a modalidad por equipos: el evento ya tiene ${individualesVivos} inscripción(es) individual(es).` },
        { status: 409 },
      );
    }
    if (concurso?.modalidad !== 'equipos' && equiposVivos > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: `No se puede quitar la modalidad por equipos: el evento ya tiene ${equiposVivos} equipo(s) inscrito(s). Cancela primero sus inscripciones.` },
        { status: 409 },
      );
    }

    // 3. Update Evento.
    // `cupos_disponibles` NO se calcula aquí: se escribe un valor provisional
    // (el que había) y al final de la transacción `recalcularCupos` lo deriva de
    // las inscripciones reales (y, si los desafíos dictan el aforo, también
    // reescribe `cupos`). Ver src/lib/eventos-cupos.js.
    const cuposValue = evento.cupos === undefined ? actual.cupos_actual : evento.cupos;
    const slugValue = evento.slug === undefined ? actual.slug_actual : evento.slug;
    const estadoValue = evento.estado === undefined ? actual.estado_actual : evento.estado;

    await client.query(
      `UPDATE evento SET
          nombre = $1,
          descripcion_html = $2,
          id_tipo_evento = $3,
          id_alcance = $4,
          fecha_inicio = $5,
          fecha_fin = $6,
          fecha_limite_registro = $7,
          hora_inicio = $8,
          hora_fin = $9,
          ubicacion = $10,
          cupos = $11,
          cupos_disponibles = $12,
          tiene_costo = $13,
          costo = $14,
          imagen_flyer_url = $15,
          imagen_flyer_key = $16,
          solicitar_talla = $17,
          asignar_mesas = $18,
          instrucciones_pago = $19,
          slug = $20,
          estado = $21,
          updated_at = NOW()
        WHERE id_evento = $22`,
      [
        evento.nombre, sanitizeHtml(evento.descripcion_html || ''), evento.id_tipo_evento, evento.id_alcance,
        evento.fecha_inicio, evento.fecha_fin, evento.fecha_limite_registro, evento.hora_inicio, evento.hora_fin,
        evento.ubicacion, cuposValue, actual.cupos_disponibles, evento.tiene_costo, evento.costo,
        finalUrl, finalKey, evento.solicitar_talla, evento.asignar_mesas,
        evento.instrucciones_pago,
        slugValue,
        estadoValue,
        id,
      ],
    );

    // 4. Handle Concurso (Insert, Update, or Delete)
    if (concurso) {
        const checkConcurso = await client.query('SELECT id_concurso FROM concurso WHERE id_evento = $1', [id]);
        const valores = [
          concurso.id_plataforma,
          concurso.modalidad,
          concurso.max_integrantes_equipo,
          concurso.min_integrantes_equipo,
          concurso.requiere_asesor,
          concurso.asesor_participa,
          concurso.max_asesores,
          concurso.url_concurso,
          id,
        ];
        if (checkConcurso.rows.length > 0) {
            await client.query(
              `UPDATE concurso SET
                  id_plataforma = $1, modalidad = $2, max_integrantes_equipo = $3,
                  min_integrantes_equipo = $4, requiere_asesor = $5, asesor_participa = $6,
                  max_asesores = $7, url_concurso = $8
                WHERE id_evento = $9`,
              valores,
            );
        } else {
            await client.query(
              `INSERT INTO concurso (
                  id_plataforma, modalidad, max_integrantes_equipo, min_integrantes_equipo,
                  requiere_asesor, asesor_participa, max_asesores, url_concurso, id_evento
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              valores,
            );
        }
    } else {
        // Si dejó de ser concurso, NO borrar a ciegas: hay equipos/inscripciones
        // colgando de `concurso` por CASCADE. Solo se permite quitar el concurso
        // si no tiene equipos registrados; de lo contrario, se rechaza para evitar
        // pérdida de datos silenciosa.
        const equiposRes = await client.query(
          `SELECT COUNT(*)::int AS n
             FROM equipo_concurso eq
             JOIN concurso c ON eq.id_concurso = c.id_concurso
            WHERE c.id_evento = $1`,
          [id],
        );
        if (equiposRes.rows[0].n > 0) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: 'No se puede convertir en evento normal: el concurso ya tiene equipos registrados. Elimina primero las inscripciones de equipo.' },
            { status: 409 },
          );
        }
        await client.query('DELETE FROM concurso WHERE id_evento = $1', [id]);
    }

    // 5. Reconciliación del aforo: fuente de verdad = las inscripciones reales
    //    (y los desafíos, si dictan el aforo). Se ejecuta SIEMPRE, así que
    //    guardar el evento sin tocar nada ya repara un contador desincronizado.
    const cupos = await recalcularCupos(client, id);

    await client.query('COMMIT');

    // Borrado diferido del archivo viejo en el CDN (ya commiteado).
    if (keyToDeleteAfterCommit) {
      await deleteFromUploadThing(keyToDeleteAfterCommit);
    }

    return NextResponse.json({
      success: true,
      message: 'Evento actualizado correctamente',
      cupos: cupos.cupos,
      cupo_por_retos: cupos.cupo_por_retos,
      lugares_ocupados: cupos.lugares_ocupados,
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    if (error instanceof EventoInvalido) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error en PUT /api/admin/eventos/[id]:', error);
    const mensaje = mensajeErrorEvento(error);
    if (mensaje) {
      return NextResponse.json({ error: mensaje }, { status: error.code === '23505' ? 409 : 400 });
    }
    return NextResponse.json({ error: 'Error al actualizar evento' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

export async function DELETE(request, context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;

  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  let client;
  try {
    client = await connectWithRetry();

    // BAJA LÓGICA, no DELETE físico.
    //
    // El DELETE anterior arrastraba por ON DELETE CASCADE mucho más de lo que
    // el panel insinúa: inscripciones y sus pagos, evidencias, staff y jueces,
    // el concurso con sus equipos e integrantes y —lo más grave— la SESIÓN del
    // programa recurrente ligada al evento (sesion_programa.id_evento), que a su
    // vez se lleva asistencia_miembro y asistencia_invitado. Historial de
    // asistencia y de cobros perdido, sin vuelta atrás.
    //
    // La columna `deleted_at` ya existía y TODAS las lecturas la filtran
    // (admin/eventos, eventos público, ficha pública, staff), pero nadie la
    // escribía nunca: el borrado lógico estaba montado y sin usar.
    //
    // Tampoco se borran los archivos del CDN: una baja reversible no debe
    // destruir el flyer ni las evidencias. `listable = FALSE` lo saca además de
    // cualquier listado aunque alguien reactive la fila a mano.
    const del = await client.query(
      `UPDATE evento
          SET deleted_at = NOW(), estado = 'cancelado', listable = FALSE, updated_at = NOW()
        WHERE id_evento = $1 AND deleted_at IS NULL
        RETURNING id_evento`,
      [id],
    );

    if (del.rowCount === 0) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Evento eliminado correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/admin/eventos/[id]:', error);
    return NextResponse.json({ error: 'Error al eliminar evento' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
