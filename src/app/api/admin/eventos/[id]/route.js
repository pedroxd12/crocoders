import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { UTApi } from "uploadthing/server";
import { sanitizeHtml } from '@/lib/sanitize';

const utapi = new UTApi();

// Helper function to delete from UploadThing
async function deleteFromUploadThing(fileKey) {
  if (!fileKey) return;
  try {
    await utapi.deleteFiles(fileKey);
    console.log(`Successfully deleted ${fileKey} from UploadThing`);
  } catch (e) {
    console.error(`Error deleting ${fileKey} from UploadThing:`, e);
  }
}

export async function GET(request, context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  const client = await pool.connect();

  if (!id || isNaN(Number(id))) {
      return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  try {
    // Basic event info + counts
    const query = `
      SELECT 
        e.*,
        t.nombre as tipo_nombre,
        a.nombre as alcance_nombre,
        -- Concurso info
        c.id_concurso,
        c.modalidad,
        c.max_integrantes_equipo,
        c.min_integrantes_equipo,
        c.id_plataforma,
        c.requiere_asesor,
        c.url_concurso,
        (SELECT COUNT(*) FROM inscripcion_evento WHERE id_evento = e.id_evento AND estado <> 'cancelada') as total_inscritos
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

    const evento = result.rows[0];
    
    // Formatear fecha_limite_registro para datetime-local (sin conversión UTC)
    if (evento.fecha_limite_registro) {
      const fecha = new Date(evento.fecha_limite_registro);
      // Obtener componentes en timezone local del servidor
      const year = fecha.getFullYear();
      const month = String(fecha.getMonth() + 1).padStart(2, '0');
      const day = String(fecha.getDate()).padStart(2, '0');
      const hours = String(fecha.getHours()).padStart(2, '0');
      const minutes = String(fecha.getMinutes()).padStart(2, '0');
      evento.fecha_limite_registro = `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    return NextResponse.json(evento);
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

  if (!id) {
    return NextResponse.json({ error: 'ID de evento es requerido' }, { status: 400 });
  }

  let client;
  try {
    client = await pool.connect();
    const body = await request.json();
    const {
        nombre, descripcion_html, id_tipo_evento, id_alcance,
        fecha_inicio, fecha_fin, fecha_limite_registro, hora_inicio, hora_fin,
        ubicacion, cupos, tiene_costo, costo,
        imagen_flyer_url, imagen_flyer_key,
        // Concurso
        es_concurso, modalidad, max_integrantes_equipo, min_integrantes_equipo, id_plataforma, 
        requiere_asesor, url_concurso
    } = body;

    // Validación de campos obligatorios (la DB exige fecha_fin/hora_fin NOT NULL).
    if (!nombre || !id_tipo_evento || !id_alcance || !fecha_inicio || !hora_inicio || !hora_fin) {
        return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    await client.query('BEGIN');

    // 1. Bloquear el evento y leer estado actual (imagen + cupos).
    const currentRes = await client.query(
      'SELECT imagen_flyer_url, imagen_flyer_key, cupos AS cupos_actual, cupos_disponibles FROM evento WHERE id_evento = $1 FOR UPDATE',
      [id],
    );
    if (currentRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const oldUrl = currentRes.rows[0].imagen_flyer_url;
    const oldKey = currentRes.rows[0].imagen_flyer_key;

    // Si la propiedad no viene en el body, conservar el valor actual. Solo se
    // toca cuando el cliente envía explícitamente la propiedad (incluso como null
    // para indicar borrado).
    const hasKeyField = Object.prototype.hasOwnProperty.call(body, 'imagen_flyer_key');
    const hasUrlField = Object.prototype.hasOwnProperty.call(body, 'imagen_flyer_url');

    let finalKey = oldKey;
    let finalUrl = oldUrl;
    // El borrado en el CDN se difiere a DESPUÉS del COMMIT: si la transacción
    // hiciera ROLLBACK, no queremos haber borrado un archivo aún referenciado.
    let keyToDeleteAfterCommit = null;

    if (hasKeyField) {
      finalKey = imagen_flyer_key ?? null;
      if (oldKey && oldKey !== finalKey) {
        keyToDeleteAfterCommit = oldKey;
      }
    }
    if (hasUrlField) {
      finalUrl = imagen_flyer_url ?? null;
    }

    // Recalcular cupos_disponibles si cambian los cupos totales.
    // Disponibles = cupos_nuevos - lugares_ocupados (clamp a [0, cupos]).
    // Un equipo ocupa tantos lugares como integrantes tenga.
    const nuevoCupos = parseInt(cupos);
    let nuevosDisponibles = currentRes.rows[0].cupos_disponibles;
    if (Number.isInteger(nuevoCupos) && nuevoCupos !== currentRes.rows[0].cupos_actual) {
      const ocupRes = await client.query(
        `SELECT COALESCE(SUM(
                  CASE WHEN ie.id_equipo IS NOT NULL
                       THEN (SELECT COUNT(*) FROM integrante_equipo WHERE id_equipo = ie.id_equipo)
                       ELSE 1 END
                ), 0)::int AS ocupados
           FROM inscripcion_evento ie
          WHERE ie.id_evento = $1 AND ie.estado <> 'cancelada'`,
        [id],
      );
      const ocupados = ocupRes.rows[0].ocupados;
      nuevosDisponibles = Math.max(0, Math.min(nuevoCupos, nuevoCupos - ocupados));
    }

    // 2. Update Evento
    const updateQuery = `
        UPDATE evento SET
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
            updated_at = NOW()
        WHERE id_evento = $17
        RETURNING *
    `;

    const fechaFinValue = fecha_fin || fecha_inicio;
    const costoValue = parseFloat(costo) || 0;
    const tieneCostoValue = Boolean(tiene_costo) || costoValue > 0;
    const cuposValue = Number.isInteger(nuevoCupos) ? nuevoCupos : currentRes.rows[0].cupos_actual;

    await client.query(updateQuery, [
        nombre, sanitizeHtml(descripcion_html || ''), id_tipo_evento, id_alcance,
        fecha_inicio, fechaFinValue, fecha_limite_registro || null, hora_inicio, hora_fin,
        ubicacion ?? null, cuposValue, nuevosDisponibles, tieneCostoValue, costoValue,
        finalUrl, finalKey,
        id
    ]);

    // 3. Handle Concurso (Insert, Update, or Delete)
    if (es_concurso) {
        const checkConcurso = await client.query('SELECT id_concurso FROM concurso WHERE id_evento = $1', [id]);
        
        if (checkConcurso.rows.length > 0) {
            // Update existing
            await client.query(`
                UPDATE concurso SET
                    id_plataforma = $1,
                    modalidad = $2,
                    max_integrantes_equipo = $3,
                    min_integrantes_equipo = $4,
                    requiere_asesor = $5,
                    url_concurso = $6
                WHERE id_evento = $7
            `, [
                id_plataforma || null, 
                modalidad || 'individual',
                modalidad === 'equipos' ? (parseInt(max_integrantes_equipo) || 3) : null,
                modalidad === 'equipos' ? (parseInt(min_integrantes_equipo) || 2) : 1,
                requiere_asesor,
                url_concurso,
                id
            ]);
        } else {
            // Create new
            await client.query(`
                INSERT INTO concurso (
                    id_evento, id_plataforma, modalidad, 
                    max_integrantes_equipo, min_integrantes_equipo, requiere_asesor, url_concurso
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                id,
                id_plataforma || null, 
                modalidad || 'individual',
                modalidad === 'equipos' ? (parseInt(max_integrantes_equipo) || 3) : null,
                modalidad === 'equipos' ? (parseInt(min_integrantes_equipo) || 2) : 1,
                requiere_asesor,
                url_concurso
            ]);
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

    await client.query('COMMIT');

    // Borrado diferido del archivo viejo en el CDN (ya commiteado).
    if (keyToDeleteAfterCommit) {
      await deleteFromUploadThing(keyToDeleteAfterCommit);
    }

    return NextResponse.json({ success: true, message: 'Evento actualizado correctamente' });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    console.error('Error en PUT /api/admin/eventos/[id]:', error);
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
    client = await pool.connect();
    // Get image key to delete from storage
    const imgRes = await client.query('SELECT imagen_flyer_key FROM evento WHERE id_evento = $1', [id]);
    
    if (imgRes.rows.length === 0) {
        return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    const { imagen_flyer_key } = imgRes.rows[0];

    // Borrar primero de BD (cascade) y solo si tiene éxito eliminar del CDN.
    // Si invertimos el orden, un fallo de BD dejaría el archivo eliminado del
    // CDN pero el evento intacto.
    await client.query('DELETE FROM evento WHERE id_evento = $1', [id]);

    if (imagen_flyer_key) {
      deleteFromUploadThing(imagen_flyer_key);
    }

    return NextResponse.json({ success: true, message: 'Evento eliminado correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/admin/eventos/[id]:', error);
    return NextResponse.json({ error: 'Error al eliminar evento' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}