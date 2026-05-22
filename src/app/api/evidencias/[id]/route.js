// src/app/api/evidencias/[id]/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
// Remove: import { deleteFile } from '@/lib/storage-server'; // Local file deletion not needed
import { UTApi } from "uploadthing/server";
import { requireAdmin } from '@/lib/auth';

const utapi = new UTApi();

async function deleteFromUploadThing(fileKey) {
  if (!fileKey) return;
  try {
    await utapi.deleteFiles(fileKey);
    console.log(`Successfully deleted ${fileKey} from UploadThing`);
  } catch (e) {
    console.error(`Error deleting ${fileKey} from UploadThing:`, e);
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