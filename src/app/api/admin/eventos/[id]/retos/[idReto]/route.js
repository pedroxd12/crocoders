import { NextResponse } from 'next/server';
import { UTApi } from 'uploadthing/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { retoUpdateSchema, parseOrError } from '@/lib/validation';
import { slugDisponible } from '@/lib/retos';

const utapi = new UTApi();

// Mismo criterio que el flyer del evento: al reemplazar o quitar la imagen se
// borra el archivo del CDN, que si no queda pagando cuota para siempre.
async function borrarDelCdn(fileKey) {
  if (!fileKey) return;
  try {
    await utapi.deleteFiles(fileKey);
  } catch (e) {
    console.error(`No se pudo borrar ${fileKey} de UploadThing:`, e);
  }
}

const vacioANull = (v) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

const listaLimpia = (v) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean);

async function cargarReto(client, idEvento, idReto) {
  const res = await client.query(
    'SELECT * FROM reto_evento WHERE id_reto = $1 AND id_evento = $2',
    [idReto, idEvento],
  );
  return res.rows[0] ?? null;
}

export async function PUT(request, context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id, idReto } = await context.params;
  const idEvento = Number(id);
  const retoId = Number(idReto);
  if (!Number.isInteger(idEvento) || !Number.isInteger(retoId)) {
    return NextResponse.json({ error: 'Identificadores inválidos' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  const [datos, errPayload] = parseOrError(retoUpdateSchema, body);
  if (errPayload) return NextResponse.json({ error: errPayload.error }, { status: 400 });

  const client = await connectWithRetry();
  try {
    await client.query('BEGIN');

    const actual = await cargarReto(client, idEvento, retoId);
    if (!actual) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 });
    }

    // El slug sólo se regenera si cambia el título: es el ancla de la landing y
    // viaja en los enlaces ?reto=, así que renombrarlo sin motivo rompe enlaces
    // ya compartidos.
    let slug = actual.slug;
    if (datos.titulo !== undefined && datos.titulo.trim() !== actual.titulo) {
      slug = await slugDisponible(client, idEvento, datos.titulo, retoId);
    }

    // `imagen_key` presente en el cuerpo (aunque sea null) significa que el
    // admin tocó la imagen: si había otra, se borra del CDN. Si la clave no
    // viene, la imagen no se toca (mismo contrato que el flyer del evento).
    const tocaImagen = Object.prototype.hasOwnProperty.call(body, 'imagen_key');
    const nuevaKey = tocaImagen ? vacioANull(datos.imagen_key) : actual.imagen_key;
    const nuevaUrl = tocaImagen ? vacioANull(datos.imagen_url) : actual.imagen_url;
    const keyAntigua = tocaImagen && actual.imagen_key && actual.imagen_key !== nuevaKey
      ? actual.imagen_key
      : null;

    const res = await client.query(
      `UPDATE reto_evento SET
         slug = $2,
         titulo = COALESCE($3, titulo),
         lede = $4, resumen = $5, descripcion = $6, entregable = $7,
         patrocinador = $8, premio = $9,
         tags = COALESCE($10, tags),
         criterios = COALESCE($11, criterios),
         cupo_equipos = $12,
         imagen_url = $13, imagen_key = $14,
         tono = COALESCE($15, tono),
         orden = COALESCE($16, orden),
         activo = COALESCE($17, activo),
         updated_at = NOW()
       WHERE id_reto = $1
       RETURNING id_reto, slug`,
      [
        retoId,
        slug,
        datos.titulo !== undefined ? datos.titulo.trim() : null,
        // Los textos SÍ se pisan con NULL cuando el formulario los deja vacíos
        // (es la forma de borrar un dato); por eso no llevan COALESCE. Si la
        // clave no viene en el parche, se conserva lo que ya había.
        datos.lede !== undefined ? vacioANull(datos.lede) : actual.lede,
        datos.resumen !== undefined ? vacioANull(datos.resumen) : actual.resumen,
        datos.descripcion !== undefined ? vacioANull(datos.descripcion) : actual.descripcion,
        datos.entregable !== undefined ? vacioANull(datos.entregable) : actual.entregable,
        datos.patrocinador !== undefined ? vacioANull(datos.patrocinador) : actual.patrocinador,
        datos.premio !== undefined ? vacioANull(datos.premio) : actual.premio,
        datos.tags !== undefined ? listaLimpia(datos.tags) : null,
        datos.criterios !== undefined ? listaLimpia(datos.criterios) : null,
        datos.cupo_equipos !== undefined ? (datos.cupo_equipos ?? null) : actual.cupo_equipos,
        nuevaUrl,
        nuevaKey,
        datos.tono ?? null,
        datos.orden ?? null,
        datos.activo ?? null,
      ],
    );

    await client.query('COMMIT');

    // Fuera de la transacción: si el CDN falla no debe deshacer el guardado.
    await borrarDelCdn(keyAntigua);

    return NextResponse.json({ message: 'Reto actualizado', ...res.rows[0] });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // La conexión ya venía rota; el error real es el de arriba.
    }
    console.error('Error en PUT /api/admin/eventos/[id]/retos/[idReto]:', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un reto con ese título en el evento.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al actualizar el reto' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request, context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id, idReto } = await context.params;
  const idEvento = Number(id);
  const retoId = Number(idReto);
  if (!Number.isInteger(idEvento) || !Number.isInteger(retoId)) {
    return NextResponse.json({ error: 'Identificadores inválidos' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    const actual = await cargarReto(client, idEvento, retoId);
    if (!actual) {
      return NextResponse.json({ error: 'Reto no encontrado' }, { status: 404 });
    }

    // Borrar un reto con equipos dentro los dejaría sin desafío (la FK es
    // ON DELETE SET NULL) y nadie sabría después a qué reto pertenecían. Se
    // desactiva, que es lo que el admin quiere casi siempre.
    const enUso = await client.query(
      `SELECT COUNT(*)::int AS total FROM inscripcion_evento
        WHERE id_reto = $1 AND estado <> 'cancelada'`,
      [retoId],
    );
    if (enUso.rows[0].total > 0) {
      return NextResponse.json(
        {
          error: `“${actual.titulo}” tiene ${enUso.rows[0].total} inscripción(es): no se puede borrar. Desactívalo para que deje de admitir registros sin perder los que ya tiene.`,
          code: 'RETO_EN_USO',
        },
        { status: 409 },
      );
    }

    await client.query('DELETE FROM reto_evento WHERE id_reto = $1', [retoId]);
    await borrarDelCdn(actual.imagen_key);

    return NextResponse.json({ message: 'Reto eliminado' });
  } catch (error) {
    console.error('Error en DELETE /api/admin/eventos/[id]/retos/[idReto]:', error);
    return NextResponse.json({ error: 'Error al eliminar el reto' }, { status: 500 });
  } finally {
    client.release();
  }
}
