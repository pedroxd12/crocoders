import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { parseOrError } from '@/lib/validation';
import { esPorEquipos } from '@/lib/aforo';

// Asignación AUTOMÁTICA de mesas a las inscripciones vivas de un evento.
//
// La asignación manual de una sola inscripción va por PATCH
// /api/eventos/inscripciones/[id] (acción `set_mesa`, también para staff con
// rol de gestión). Esto es el reparto masivo del administrador:
//   - `modo` 'secuencial': Mesa 1, Mesa 2… en orden de inscripción.
//   - `modo` 'por_desafio': agrupa por desafío (los equipos de un mismo reto
//     quedan contiguos) y numera seguido.
//   - `por_mesa`: cuántas inscripciones caben en cada mesa (1 en concursos por
//     equipos: una mesa por equipo; en eventos individuales, p. ej. 4 personas
//     por mesa).
//   - `sobrescribir`: si false, sólo se asignan las inscripciones sin mesa y
//     la numeración continúa después de la más alta ya usada.
const asignacionSchema = z.object({
  modo: z.enum(['secuencial', 'por_desafio']).default('secuencial'),
  prefijo: z.string().trim().max(20).default('Mesa'),
  inicio: z.coerce.number().int().min(1).max(9999).default(1),
  por_mesa: z.coerce.number().int().min(1).max(50).default(1),
  sobrescribir: z.boolean().default(false),
});

export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const [opciones, err] = parseOrError(asignacionSchema, body ?? {});
  if (err) return NextResponse.json({ error: err.error }, { status: 400 });

  const client = await connectWithRetry();
  try {
    await client.query('BEGIN');
    const ev = await client.query(
      `SELECT e.id_evento, e.asignar_mesas, t.permite_equipos, c.id_concurso, c.modalidad
         FROM evento e
         LEFT JOIN catalogo_tipo_evento t ON t.id_tipo_evento = e.id_tipo_evento
         LEFT JOIN concurso c ON c.id_evento = e.id_evento
        WHERE e.id_evento = $1 AND e.deleted_at IS NULL FOR UPDATE OF e`,
      [id],
    );
    if (ev.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const evento = ev.rows[0];
    if (!evento.asignar_mesas) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Este evento no reparte mesas. Actívalo en la configuración del evento («Asignar mesas o lugares»).' },
        { status: 400 },
      );
    }

    // Inscripciones vivas en el orden de reparto. Con `por_desafio` los retos
    // van por su orden en la baraja y las inscripciones sin reto al final.
    const orden = opciones.modo === 'por_desafio'
      ? 'ORDER BY (r.id_reto IS NULL), r.orden, r.id_reto, ie.fecha_inscripcion, ie.id_inscripcion'
      : 'ORDER BY ie.fecha_inscripcion, ie.id_inscripcion';
    const insc = await client.query(
      `SELECT ie.id_inscripcion, ie.mesa
         FROM inscripcion_evento ie
         LEFT JOIN reto_evento r ON r.id_reto = ie.id_reto
        WHERE ie.id_evento = $1 AND ie.estado <> 'cancelada'
        ${orden}`,
      [id],
    );

    // Numeración: desde `inicio`, o después del número más alto ya usado con
    // el mismo prefijo cuando NO se sobrescribe.
    let siguiente = opciones.inicio;
    if (!opciones.sobrescribir) {
      const usadas = insc.rows
        .map((f) => f.mesa)
        .filter(Boolean)
        .map((m) => {
          const match = String(m).match(/(\d+)\s*$/);
          return match ? Number(match[1]) : null;
        })
        .filter((n) => Number.isFinite(n));
      if (usadas.length > 0) siguiente = Math.max(siguiente, Math.max(...usadas) + 1);
    }

    const pendientes = insc.rows.filter((f) => opciones.sobrescribir || !f.mesa);
    // En un concurso por equipos cada mesa es de UN equipo salvo que el admin
    // pida otra cosa; en individuales, `por_mesa` personas por mesa.
    const porMesa = esPorEquipos(evento) && body?.por_mesa === undefined ? 1 : opciones.por_mesa;

    let asignadas = 0;
    for (let i = 0; i < pendientes.length; i += 1) {
      const numero = siguiente + Math.floor(i / porMesa);
      const etiqueta = `${opciones.prefijo ? `${opciones.prefijo} ` : ''}${numero}`.trim().slice(0, 40);
      await client.query(
        'UPDATE inscripcion_evento SET mesa = $2, updated_at = NOW() WHERE id_inscripcion = $1',
        [pendientes[i].id_inscripcion, etiqueta],
      );
      asignadas += 1;
    }

    await client.query('COMMIT');
    return NextResponse.json({
      success: true,
      asignadas,
      sin_cambios: insc.rows.length - asignadas,
      mesas_usadas: pendientes.length === 0 ? 0 : Math.ceil(pendientes.length / porMesa),
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error en POST /api/admin/eventos/[id]/mesas:', error);
    return NextResponse.json({ error: 'Error al asignar las mesas' }, { status: 500 });
  } finally {
    client.release();
  }
}

// Quitar todas las mesas del evento (para volver a repartir desde cero).
export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });

  const client = await connectWithRetry();
  try {
    const res = await client.query(
      'UPDATE inscripcion_evento SET mesa = NULL, updated_at = NOW() WHERE id_evento = $1 AND mesa IS NOT NULL',
      [id],
    );
    return NextResponse.json({ success: true, limpiadas: res.rowCount });
  } catch (error) {
    console.error('Error en DELETE /api/admin/eventos/[id]/mesas:', error);
    return NextResponse.json({ error: 'Error al limpiar las mesas' }, { status: 500 });
  } finally {
    client.release();
  }
}
