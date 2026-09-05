import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { retoCreateSchema, parseOrError } from '@/lib/validation';
import { listarRetos, slugDisponible } from '@/lib/retos';
import { recalcularCupos } from '@/lib/eventos-cupos';

// Retos (desafíos) de un evento. Es el CRUD que sustituye a tener los desafíos
// escritos a mano dentro de un componente de React: crear uno aquí lo publica
// en la landing del evento y lo pone a elegir en el formulario de inscripción.
//
// AFORO: cuando todos los desafíos activos tienen cupo, el aforo del evento es
// la suma de esos cupos (src/lib/eventos-cupos.js). Por eso cada alta, edición
// o baja de un desafío termina con `recalcularCupos` bajo el bloqueo del
// evento: así `evento.cupos` nunca se queda desfasado de sus desafíos.

// Texto vacío del formulario -> NULL en la base (y no ''), para que la UI
// pueda distinguir "sin dato" de "cadena vacía" con un simple COALESCE.
const vacioANull = (v) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

const listaLimpia = (v) =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(x).trim())
    .filter(Boolean);

export async function GET(request, context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  if (!id || Number.isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    // Sin `soloActivos`: el panel también gestiona los retos retirados.
    const retos = await listarRetos(client, Number(id));
    return NextResponse.json(retos);
  } catch (error) {
    console.error('Error en GET /api/admin/eventos/[id]/retos:', error);
    return NextResponse.json({ error: 'Error al obtener los retos' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request, context) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const idEvento = Number(id);
  if (!Number.isInteger(idEvento) || idEvento <= 0) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  const [datos, errPayload] = parseOrError(retoCreateSchema, body);
  if (errPayload) return NextResponse.json({ error: errPayload.error }, { status: 400 });

  const client = await connectWithRetry();
  try {
    await client.query('BEGIN');

    // Bloqueo del evento: el recálculo del aforo del final es atómico frente a
    // registros simultáneos.
    const eventoRes = await client.query(
      'SELECT id_evento FROM evento WHERE id_evento = $1 AND deleted_at IS NULL FOR UPDATE',
      [idEvento],
    );
    if (eventoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }

    const slug = await slugDisponible(client, idEvento, datos.titulo);

    // Orden por defecto: al final de la lista. Así crear retos seguidos los
    // deja en el orden en que se escribieron sin tener que numerarlos a mano.
    let orden = datos.orden;
    if (orden === undefined || orden === null) {
      const ultimo = await client.query(
        'SELECT COALESCE(MAX(orden), -1) + 1 AS siguiente FROM reto_evento WHERE id_evento = $1',
        [idEvento],
      );
      orden = ultimo.rows[0].siguiente;
    }

    // Tono por defecto: rota entre los 5 colores del manual de marca según la
    // posición, que es justo lo que hacía la baraja escrita a mano.
    const tono = datos.tono ?? ((Number(orden) % 5) + 1);

    const res = await client.query(
      `INSERT INTO reto_evento (
         id_evento, slug, titulo, lede, resumen, descripcion, entregable,
         patrocinador, premio, tags, criterios, cupo_equipos,
         imagen_url, imagen_key, tono, orden, activo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id_reto`,
      [
        idEvento,
        slug,
        datos.titulo.trim(),
        vacioANull(datos.lede),
        vacioANull(datos.resumen),
        vacioANull(datos.descripcion),
        vacioANull(datos.entregable),
        vacioANull(datos.patrocinador),
        vacioANull(datos.premio),
        listaLimpia(datos.tags),
        listaLimpia(datos.criterios),
        datos.cupo_equipos ?? null,
        vacioANull(datos.imagen_url),
        vacioANull(datos.imagen_key),
        tono,
        orden,
        datos.activo ?? true,
      ],
    );

    const cupos = await recalcularCupos(client, idEvento);
    await client.query('COMMIT');

    return NextResponse.json(
      { message: 'Reto creado', id_reto: res.rows[0].id_reto, slug, cupo_por_retos: cupos.cupo_por_retos },
      { status: 201 },
    );
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error en POST /api/admin/eventos/[id]/retos:', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un reto con ese título en el evento.' }, { status: 409 });
    }
    if (error.code === '23514') {
      return NextResponse.json({ error: 'Datos del reto inválidos: revisa el cupo y el color.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Error al crear el reto' }, { status: 500 });
  } finally {
    client.release();
  }
}
