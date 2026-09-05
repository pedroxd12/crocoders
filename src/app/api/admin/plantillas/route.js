import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { parseOrError } from '@/lib/validation';
import { normalizarCampos } from '@/lib/documentos-campos';
import { listarPlantillas, plantillaCreateSchema } from '@/lib/plantillas-documento';
import { deleteFromUploadThing } from '@/lib/uploadthing-server';

// Plantillas de certificados, gafetes y reconocimientos.
//   GET  /api/admin/plantillas?evento=ID   |  ?programa=ID
//   POST /api/admin/plantillas             { id_evento|id_programa, tipo, nombre, pdf_url, pdf_key, pagina, campos }
// El PDF ya está en UploadThing cuando llega el POST (plantillaPdfUploader);
// si la fila no se puede crear, el archivo se borra para no dejarlo huérfano.

export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const idEvento = Number(searchParams.get('evento')) || null;
  const idPrograma = Number(searchParams.get('programa')) || null;
  if (!idEvento && !idPrograma) {
    return NextResponse.json({ error: 'Indica ?evento=ID o ?programa=ID' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    const plantillas = await listarPlantillas(client, { idEvento, idPrograma });
    return NextResponse.json(plantillas);
  } catch (error) {
    console.error('Error en GET /api/admin/plantillas:', error);
    return NextResponse.json({ error: 'Error al obtener las plantillas' }, { status: 500 });
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
  const [datos, err] = parseOrError(plantillaCreateSchema, body);
  if (err) {
    await deleteFromUploadThing(body?.pdf_key);
    return NextResponse.json({ error: err.error }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    // El evento o programa tiene que existir (FK clara en vez de 23503 → 500).
    const existe = datos.id_evento != null
      ? await client.query('SELECT 1 FROM evento WHERE id_evento = $1 AND deleted_at IS NULL', [datos.id_evento])
      : await client.query('SELECT 1 FROM programa_recurrente WHERE id_programa = $1', [datos.id_programa]);
    if (existe.rows.length === 0) {
      await deleteFromUploadThing(datos.pdf_key);
      return NextResponse.json({ error: 'El evento o programa no existe.' }, { status: 404 });
    }

    const res = await client.query(
      `INSERT INTO plantilla_documento (id_evento, id_programa, tipo, nombre, pdf_url, pdf_key, pagina, campos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id_plantilla`,
      [
        datos.id_evento ?? null,
        datos.id_programa ?? null,
        datos.tipo,
        datos.nombre,
        datos.pdf_url,
        datos.pdf_key,
        datos.pagina,
        JSON.stringify(normalizarCampos(datos.campos)),
      ],
    );
    return NextResponse.json({ message: 'Plantilla creada', id_plantilla: res.rows[0].id_plantilla }, { status: 201 });
  } catch (error) {
    console.error('Error en POST /api/admin/plantillas:', error);
    await deleteFromUploadThing(datos.pdf_key);
    return NextResponse.json({ error: 'Error al crear la plantilla' }, { status: 500 });
  } finally {
    client.release();
  }
}
