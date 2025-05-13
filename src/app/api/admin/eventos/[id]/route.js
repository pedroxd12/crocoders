// src/app/api/admin/eventos/[id]/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
// Remove: import { uploadFile, deleteFile } from '@/lib/storage-server'; // uploadFile not needed, deleteFile for local storage not needed
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
    // Decide if you want to throw an error or just log it
  }
}


export async function GET(request, context) {
  const { id } = await context.params;

  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  try {
    const [evento] = await sql`
      SELECT 
        e.*,
        (
          SELECT COUNT(*) FROM asistencia_miembro WHERE id_evento = e.id_evento
        ) as miembros_count,
        (
          SELECT COUNT(*) FROM asistencia_invitado WHERE id_evento = e.id_evento
        ) as invitados_count
      FROM evento e
      WHERE e.id_evento = ${id}
    `;

    if (!evento) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    evento.asistentes_count = (evento.miembros_count || 0) + (evento.invitados_count || 0);

    return NextResponse.json(evento);
  } catch (error) {
    console.error('Error en GET /api/eventos/[id]:', error);
    return NextResponse.json({ error: 'Error al obtener evento' }, { status: 500 });
  }
}

export async function PUT(request, context) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: 'ID de evento es requerido' }, { status: 400 });
  }

  try {
    const formData = await request.json(); // Expecting JSON

    const requiredFields = ['nombre_evento', 'descripcion', 'tipo', 'fecha', 'hora_inicio', 'hora_fin'];
    const missingFields = requiredFields.filter(field => !formData[field]);

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Faltan campos requeridos: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    const eventoData = {
      nombre_evento: formData.nombre_evento,
      descripcion: formData.descripcion,
      tipo: formData.tipo,
      hermandad: formData.hermandad || 'club de programación',
      fecha: formData.fecha,
      hora_inicio: formData.hora_inicio,
      hora_fin: formData.hora_fin,
      cupos: parseInt(formData.cupos) || 0,
      costo: parseFloat(formData.costo) || 0,
      // imagen_url and imagen_key will be handled separately
    };

    const inicio = new Date(`${eventoData.fecha}T${eventoData.hora_inicio}`);
    const fin = new Date(`${eventoData.fecha}T${eventoData.hora_fin}`);

    if (inicio >= fin) {
      return NextResponse.json(
        { error: 'La hora de fin debe ser posterior a la hora de inicio' },
        { status: 400 }
      );
    }

    const [eventoActual] = await sql`
      SELECT imagen_url, imagen_key FROM evento WHERE id_evento = ${id}
    `;

    if (!eventoActual) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    let newImageUrl = eventoActual.imagen_url;
    let newImageKey = eventoActual.imagen_key;

    // Check if image is being changed or removed
    if (formData.hasOwnProperty('imagen_url') || formData.hasOwnProperty('imagen_key')) {
        const oldImageKey = eventoActual.imagen_key;
        
        if (formData.imagen_url === null && formData.imagen_key === null) { // Image removed
            if (oldImageKey) {
                await deleteFromUploadThing(oldImageKey);
            }
            newImageUrl = null;
            newImageKey = null;
        } else if (formData.imagen_url && formData.imagen_key) { // New image uploaded
            if (oldImageKey && oldImageKey !== formData.imagen_key) { // Delete old if different
                 await deleteFromUploadThing(oldImageKey);
            }
            newImageUrl = formData.imagen_url;
            newImageKey = formData.imagen_key;
        }
    }


    const result = await sql`
      UPDATE evento
      SET
        nombre_evento = ${eventoData.nombre_evento},
        descripcion = ${eventoData.descripcion},
        tipo = ${eventoData.tipo},
        hermandad = ${eventoData.hermandad},
        fecha = ${eventoData.fecha},
        hora_inicio = ${eventoData.hora_inicio},
        hora_fin = ${eventoData.hora_fin},
        cupos = ${eventoData.cupos},
        costo = ${eventoData.costo},
        imagen_url = ${newImageUrl},
        imagen_key = ${newImageKey}
      WHERE id_evento = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Evento no encontrado durante la actualización' }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Error en PUT /api/eventos/[id]:', error);
    return NextResponse.json({ error: 'Error al actualizar evento: ' + error.message }, { status: 500 });
  }
}

export async function DELETE(request, context) {
  const { id } = await context.params;

  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  try {
    const [evento] = await sql`
      SELECT imagen_url, imagen_key FROM evento WHERE id_evento = ${id}
    `;

    if (!evento) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    if (evento.imagen_key) {
      await deleteFromUploadThing(evento.imagen_key);
    }

    await sql`DELETE FROM asistencia_miembro WHERE id_evento = ${id}`;
    await sql`DELETE FROM asistencia_invitado WHERE id_evento = ${id}`;
    await sql`DELETE FROM evidencias WHERE id_evento = ${id}`; // Also delete related evidences

    const result = await sql`
      DELETE FROM evento WHERE id_evento = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      // This case should ideally not be reached if the select above found the event
      return NextResponse.json({ error: 'Evento no encontrado al intentar eliminar' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Evento y sus imágenes asociadas eliminados." });
  } catch (error) {
    console.error('Error en DELETE /api/eventos/[id]:', error);
    return NextResponse.json({ error: 'Error al eliminar evento: ' + error.message }, { status: 500 });
  }
}