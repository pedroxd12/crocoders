// POST /api/eventos/comprobante
// Guarda (o reemplaza) el comprobante de pago de una inscripción a un evento
// con costo. El archivo YA está en UploadThing: aquí sólo entra la metadata,
// igual que en /api/evidencias/upload.
//
// PÚBLICO por necesidad: quien paga puede ser un invitado sin cuenta. La
// credencial es el ticket firmado de la inscripción (ver comprobantes-pago.js).
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { rateLimit } from '@/lib/rate-limit';
import { comprobantePagoSchema, parseOrError } from '@/lib/validation';
import { resolverInscripcionDeToken, comprobantePublico } from '@/lib/comprobantes-pago';
import { deleteFromUploadThing } from '@/lib/uploadthing-server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  // Endpoint sin sesión: se limita por IP para que nadie llene la tabla (y la
  // cuota del CDN) reenviando metadata en bucle.
  const rl = rateLimit(request, { scope: 'comprobante-pago', limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos. Espera un momento antes de volver a subir el comprobante.' },
      { status: 429 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  // CONTRATO (idéntico al de /api/evidencias/upload): si la respuesta trae
  // `archivo_descartado: true`, el archivo ya NO existe en UploadThing y el
  // cliente debe volver a subirlo en vez de reenviar el mismo POST.
  const [data, errPayload] = parseOrError(comprobantePagoSchema, body);
  if (errPayload) {
    await deleteFromUploadThing(body?.imagen_key);
    return NextResponse.json({ ...errPayload, archivo_descartado: true }, { status: 400 });
  }

  let client;
  try {
    client = await connectWithRetry();
  } catch (error) {
    console.error('Error de conexión en /api/eventos/comprobante:', error);
    // Fallo transitorio: NO se borra el archivo, el cliente puede reintentar.
    return NextResponse.json(
      { success: false, error: 'No se pudo conectar con la base de datos. Intenta de nuevo.', code: 'DB_CONNECTION_ERROR' },
      { status: 503 },
    );
  }

  // Clave del comprobante anterior, para borrarla del CDN DESPUÉS del commit
  // (si se borrara antes y la transacción fallara, la fila quedaría apuntando a
  // un archivo inexistente: una imagen rota en el panel de quien valida).
  let claveAnterior = null;

  try {
    await client.query('BEGIN');

    const resuelto = await resolverInscripcionDeToken(client, data.qrToken);
    if (!resuelto.ok) {
      await client.query('ROLLBACK');
      await deleteFromUploadThing(data.imagen_key);
      return NextResponse.json(
        { success: false, error: resuelto.error, archivo_descartado: true },
        { status: resuelto.status },
      );
    }

    const inscripcion = resuelto.inscripcion;

    if (inscripcion.comprobante_estado === 'aprobado') {
      await client.query('ROLLBACK');
      await deleteFromUploadThing(data.imagen_key);
      return NextResponse.json(
        {
          success: false,
          error: 'Tu pago ya fue validado: no hace falta subir otro comprobante.',
          archivo_descartado: true,
        },
        { status: 409 },
      );
    }

    if (inscripcion.imagen_key && inscripcion.imagen_key !== data.imagen_key) {
      claveAnterior = inscripcion.imagen_key;
    }

    // Reemplazar vuelve a dejarlo 'pendiente' y borra el veredicto anterior: un
    // comprobante nuevo no puede seguir marcado como rechazado por la imagen
    // vieja, ni conservar quién revisó aquélla.
    const { rows } = await client.query(
      `INSERT INTO comprobante_pago (
         id_inscripcion, imagen_url, imagen_key, nombre_archivo, referencia, monto_declarado
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id_inscripcion) DO UPDATE SET
         imagen_url = EXCLUDED.imagen_url,
         imagen_key = EXCLUDED.imagen_key,
         nombre_archivo = EXCLUDED.nombre_archivo,
         referencia = EXCLUDED.referencia,
         monto_declarado = EXCLUDED.monto_declarado,
         estado = 'pendiente',
         motivo_rechazo = NULL,
         revisado_por = NULL,
         revisado_en = NULL,
         subido_en = NOW()
       RETURNING id_comprobante, imagen_url, estado AS comprobante_estado, motivo_rechazo,
                 referencia, monto_declarado, subido_en`,
      [
        inscripcion.id_inscripcion,
        data.imagen_url,
        data.imagen_key,
        data.nombre_archivo || null,
        data.referencia || null,
        data.monto_declarado ?? null,
      ],
    );

    await client.query('COMMIT');

    // Best-effort y fuera de la transacción: al archivo viejo ya no apunta nadie.
    await deleteFromUploadThing(claveAnterior);

    return NextResponse.json({
      success: true,
      message: 'Comprobante recibido. Un organizador lo validará antes del evento.',
      comprobante: comprobantePublico(rows[0]),
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error en ROLLBACK:', rollbackError);
    }

    console.error('Error al guardar el comprobante de pago:', error);

    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      // Transitorio: el cliente puede reenviar el mismo POST con la misma clave.
      return NextResponse.json(
        { success: false, error: 'Error de conexión con la base de datos. Intenta de nuevo.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }

    await deleteFromUploadThing(data.imagen_key);
    return NextResponse.json(
      { success: false, error: 'No se pudo guardar el comprobante.', archivo_descartado: true },
      { status: 500 },
    );
  } finally {
    if (client) client.release();
  }
}
