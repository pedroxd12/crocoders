// src/app/api/evidencias/[id]/route.js
import { NextResponse } from 'next/server';
import { sql, query } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { evidenciaUpdateSchema, parseOrError } from '@/lib/validation';
// Helper compartido: el borrado en el CDN vive en un solo sitio para que ningún
// camino de error se olvide de limpiar y deje archivos huérfanos.
import { deleteFromUploadThing } from '@/lib/uploadthing-server';

// PUT: editar metadata de una evidencia (título, descripción, tipo, visibilidad, orden).
// No toca el archivo en el CDN; sólo la fila en BD.
export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ error: 'ID de evidencia inválido' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  const [data, errPayload] = parseOrError(evidenciaUpdateSchema, body);
  if (errPayload) {
    return NextResponse.json({ error: errPayload.error, issues: errPayload.issues }, { status: 400 });
  }

  // SET dinámico: sólo las columnas presentes en el payload. Lista blanca de
  // columnas para evitar inyección por nombres de campo.
  const editable = {
    titulo: data.titulo,
    descripcion: data.descripcion === '' ? null : data.descripcion,
    tipo: data.tipo,
    publica: data.publica,
    orden: data.orden,
  };
  const sets = [];
  const values = [];
  let i = 1;
  for (const [col, val] of Object.entries(editable)) {
    if (val !== undefined) {
      sets.push(`${col} = $${i++}`);
      values.push(val);
    }
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
  }
  sets.push(`updated_at = NOW()`);
  values.push(idNum); // último parámetro = WHERE id

  try {
    const result = await query(
      `UPDATE evidencia SET ${sets.join(', ')}
        WHERE id_evidencia = $${i}
        RETURNING id_evidencia, id_evento, titulo as nombre, descripcion, tipo,
                  url as imagen_url, storage_key as imagen_key, publica, orden, fecha_captura as fecha`,
      values,
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Evidencia no encontrada' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error al actualizar evidencia:', error);
    return NextResponse.json({ error: 'Error al actualizar evidencia' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;

    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json(
        { error: 'ID de evidencia es requerido y debe ser un número válido' },
        { status: 400 },
      );
    }

    const [evidencia] = await sql`
      SELECT url, storage_key FROM evidencia WHERE id_evidencia = ${idNum}
    `;

    if (!evidencia) {
      return NextResponse.json(
        { error: 'Evidencia no encontrada' },
        { status: 404 },
      );
    }

    await sql`DELETE FROM evidencia WHERE id_evidencia = ${idNum}`;

    if (evidencia.storage_key) {
      // Best-effort: el archivo del CDN se borra después de la BD para evitar
      // que un fallo de UploadThing impida borrar el registro.
      deleteFromUploadThing(evidencia.storage_key);
    }

    return NextResponse.json({ success: true, message: 'Evidencia eliminada.' });
  } catch (error) {
    console.error('Error al eliminar evidencia:', error);
    return NextResponse.json(
      { error: 'Error al eliminar evidencia' },
      { status: 500 },
    );
  }
}