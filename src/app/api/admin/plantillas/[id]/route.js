import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { parseOrError } from '@/lib/validation';
import { normalizarCampos } from '@/lib/documentos-campos';
import { cargarPlantilla, plantillaUpdateSchema } from '@/lib/plantillas-documento';
import { deleteFromUploadThing } from '@/lib/uploadthing-server';

const idValido = (id) => Number.isInteger(Number(id)) && Number(id) > 0;

export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!idValido(id)) return NextResponse.json({ error: 'ID de plantilla inválido' }, { status: 400 });

  const client = await connectWithRetry();
  try {
    const plantilla = await cargarPlantilla(client, Number(id));
    if (!plantilla) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    return NextResponse.json(plantilla);
  } catch (error) {
    console.error('Error en GET /api/admin/plantillas/[id]:', error);
    return NextResponse.json({ error: 'Error al obtener la plantilla' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!idValido(id)) return NextResponse.json({ error: 'ID de plantilla inválido' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }
  const [datos, err] = parseOrError(plantillaUpdateSchema, body);
  if (err) return NextResponse.json({ error: err.error }, { status: 400 });

  const client = await connectWithRetry();
  try {
    const actual = await cargarPlantilla(client, Number(id));
    if (!actual) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });

    // Si se sube otro PDF, el anterior se borra del CDN tras guardar.
    const cambiaPdf = datos.pdf_key && datos.pdf_key !== actual.pdf_key;
    await client.query(
      `UPDATE plantilla_documento SET
         tipo = $2, nombre = $3, pdf_url = $4, pdf_key = $5, pagina = $6, campos = $7::jsonb, updated_at = NOW()
       WHERE id_plantilla = $1`,
      [
        id,
        datos.tipo ?? actual.tipo,
        datos.nombre ?? actual.nombre,
        cambiaPdf ? datos.pdf_url : actual.pdf_url,
        cambiaPdf ? datos.pdf_key : actual.pdf_key,
        datos.pagina ?? actual.pagina,
        JSON.stringify(datos.campos !== undefined ? normalizarCampos(datos.campos) : actual.campos),
      ],
    );
    if (cambiaPdf) await deleteFromUploadThing(actual.pdf_key);

    return NextResponse.json({ message: 'Plantilla actualizada' });
  } catch (error) {
    console.error('Error en PUT /api/admin/plantillas/[id]:', error);
    return NextResponse.json({ error: 'Error al actualizar la plantilla' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!idValido(id)) return NextResponse.json({ error: 'ID de plantilla inválido' }, { status: 400 });

  const client = await connectWithRetry();
  try {
    const res = await client.query(
      'DELETE FROM plantilla_documento WHERE id_plantilla = $1 RETURNING pdf_key',
      [id],
    );
    if (res.rowCount === 0) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    await deleteFromUploadThing(res.rows[0].pdf_key);
    return NextResponse.json({ message: 'Plantilla eliminada' });
  } catch (error) {
    console.error('Error en DELETE /api/admin/plantillas/[id]:', error);
    return NextResponse.json({ error: 'Error al eliminar la plantilla' }, { status: 500 });
  } finally {
    client.release();
  }
}
