import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { UTApi } from "uploadthing/server";

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
        (SELECT COUNT(*) FROM inscripcion_evento WHERE id_evento = e.id_evento) as total_inscritos
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
  const { id } = await context.params;
  const client = await pool.connect();

  if (!id) {
    return NextResponse.json({ error: 'ID de evento es requerido' }, { status: 400 });
  }

  try {
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

    // Validation
    if (!nombre) {
        return NextResponse.json({ error: 'Nombre es requerido' }, { status: 400 });
    }

    await client.query('BEGIN');

    // 1. Get current event to handle image deletion if needed
    const currentRes = await client.query('SELECT imagen_flyer_key FROM evento WHERE id_evento = $1', [id]);
    if (currentRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const oldKey = currentRes.rows[0].imagen_flyer_key;

    // Handle Image Logic
    let finalKey = oldKey;
    let finalUrl = imagen_flyer_url;

    // If explicit removal or change
    if (imagen_flyer_key !== undefined) { // Check if key provided in update (even as null)
        if (imagen_flyer_key !== oldKey) {
             if (oldKey) await deleteFromUploadThing(oldKey);
             finalKey = imagen_flyer_key;
        }
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
            tiene_costo = $12, 
            costo = $13,
            imagen_flyer_url = $14, 
            imagen_flyer_key = $15,
            updated_at = NOW()
        WHERE id_evento = $16
        RETURNING *
    `;

    const fechaFinValue = fecha_fin || fecha_inicio;
    
    await client.query(updateQuery, [
        nombre, descripcion_html, id_tipo_evento, id_alcance,
        fecha_inicio, fechaFinValue, fecha_limite_registro || null, hora_inicio, hora_fin,
        ubicacion, cupos, tiene_costo, costo,
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
        // If it was a contest but now isn't, delete from concurso
        await client.query('DELETE FROM concurso WHERE id_evento = $1', [id]);
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true, message: 'Evento actualizado correctamente' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en PUT /api/admin/eventos/[id]:', error);
    return NextResponse.json({ error: 'Error al actualizar evento: ' + error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request, context) {
  const { id } = await context.params;
  const client = await pool.connect();

  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  try {
    // Get image key to delete from storage
    const imgRes = await client.query('SELECT imagen_flyer_key FROM evento WHERE id_evento = $1', [id]);
    
    if (imgRes.rows.length === 0) {
        return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    const { imagen_flyer_key } = imgRes.rows[0];

    // Delete from storage
    if (imagen_flyer_key) {
        await deleteFromUploadThing(imagen_flyer_key);
    }
    
    // Delete from DB (Cascade handles dependencies like inscripcion_evento, concurso, evidencia, etc.)
    await client.query('DELETE FROM evento WHERE id_evento = $1', [id]);

    return NextResponse.json({ success: true, message: "Evento eliminado correctamente" });
  } catch (error) {
    console.error('Error en DELETE /api/admin/eventos/[id]:', error);
    return NextResponse.json({ error: 'Error al eliminar evento: ' + error.message }, { status: 500 });
  } finally {
    client.release();
  }
}