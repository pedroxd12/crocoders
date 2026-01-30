// src/app/api/evidencias/[id]/route.js
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
// Remove: import { deleteFile } from '@/lib/storage-server'; // Local file deletion not needed
import { UTApi } from "uploadthing/server";

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
  try {
    const { id } = params;

    if (!id || isNaN(Number(id))) {
      return NextResponse.json(
        { error: 'ID de evidencia es requerido y debe ser un número válido' },
        { status: 400 }
      );
    }

    const [evidencia] = await sql`
      SELECT imagen_url, imagen_key FROM evidencias WHERE id_evidencia = ${id}
    `;

    if (!evidencia) {
      return NextResponse.json(
        { error: 'Evidencia no encontrada' },
        { status: 404 }
      );
    }

    if (evidencia.imagen_key) {
      await deleteFromUploadThing(evidencia.imagen_key);
    }

    await sql`
      DELETE FROM evidencias WHERE id_evidencia = ${id}
    `;

    return NextResponse.json({ success: true, message: "Evidencia eliminada." });
  } catch (error) {
    console.error('Error al eliminar evidencia:', error);
    return NextResponse.json(
      { error: 'Error al eliminar evidencia: ' + error.message },
      { status: 500 }
    );
  }
}