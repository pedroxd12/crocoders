// src/app/api/evidencias/upload/route.js
// Guarda la metadata de una evidencia ya subida a UploadThing. Único endpoint
// de creación (el POST de /api/evidencias fue retirado por duplicado).
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { evidenciaCreateSchema, parseOrError } from '@/lib/validation';
import { deleteFromUploadThing } from '@/lib/uploadthing-server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  // CONTRATO: cuando la respuesta de error trae `archivo_descartado: true`, el
  // archivo ya NO existe en UploadThing. Quien llame debe olvidar esa clave y
  // volver a subir el archivo; reenviar el mismo POST guardaría una fila que
  // apunta a una URL muerta (una imagen rota en la galería pública, que es peor
  // que el archivo huérfano que se está evitando).
  const [data, errPayload] = parseOrError(evidenciaCreateSchema, body);
  if (errPayload) {
    // El archivo YA está en UploadThing (esto es el segundo paso del flujo): si
    // la metadata no se llega a guardar, nada volverá a referenciarlo y queda
    // pagando cuota sin que ningún panel pueda listarlo. Se limpia en todos los
    // caminos de error posteriores a conocer la clave.
    await deleteFromUploadThing(body?.imagen_key);
    return NextResponse.json(
      { error: errPayload.error, issues: errPayload.issues, archivo_descartado: true },
      { status: 400 },
    );
  }

  const { id_evento, id_programa, imagen_url, imagen_key, tipo, descripcion, publica, orden } = data;
  // `titulo` es el nombre canónico; aceptamos `nombre` como alias histórico.
  const titulo = data.titulo || data.nombre || 'Evidencia sin nombre';
  const creadorId = Number(guard.session.id) || null;

  try {
    // Verificar que el evento/programa exista para devolver un 404 claro en vez
    // de un 23503 (violación de FK) convertido en 500.
    if (id_evento != null) {
      const evento = await sql`SELECT 1 FROM evento WHERE id_evento = ${id_evento}`;
      if (evento.length === 0) {
        await deleteFromUploadThing(imagen_key);
        return NextResponse.json(
          { error: 'El evento indicado no existe.', archivo_descartado: true },
          { status: 404 },
        );
      }
    } else {
      const prog = await sql`SELECT 1 FROM programa_recurrente WHERE id_programa = ${id_programa}`;
      if (prog.length === 0) {
        await deleteFromUploadThing(imagen_key);
        return NextResponse.json(
          { error: 'El programa indicado no existe.', archivo_descartado: true },
          { status: 404 },
        );
      }
    }

    const [nuevaEvidencia] = await sql`
      INSERT INTO evidencia (id_evento, id_programa, titulo, descripcion, url, storage_key, tipo, fecha_captura, publica, orden, id_miembro_creador)
      VALUES (
        ${id_evento ?? null}, ${id_programa ?? null}, ${titulo}, ${descripcion || null}, ${imagen_url}, ${imagen_key},
        ${tipo}, NOW(), ${publica}, ${orden}, ${creadorId}
      )
      RETURNING id_evidencia, id_evento, id_programa, titulo as nombre, descripcion, tipo,
                url as imagen_url, storage_key as imagen_key, publica, orden, fecha_captura as fecha
    `;

    return NextResponse.json(nuevaEvidencia, { status: 201 });
  } catch (error) {
    console.error('Error al guardar evidencia (metadata):', error);
    // Un fallo de conexión es transitorio: el cliente puede reintentar el mismo
    // POST con la misma clave, así que aquí NO se borra el archivo.
    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }
    // El resto sí es definitivo (constraint violada, columna inexistente…): sin
    // fila en `evidencia` el archivo del CDN queda inalcanzable, se limpia.
    await deleteFromUploadThing(imagen_key);
    return NextResponse.json(
      { error: 'Error al guardar la evidencia', archivo_descartado: true },
      { status: 500 },
    );
  }
}
