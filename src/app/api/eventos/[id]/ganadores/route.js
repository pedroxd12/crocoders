// Ganadores de un evento para la web pública (podio y presentación).
//
// Sólo se sirven cuando administración los PUBLICÓ (`evento.resultados_publicados`).
// Un administrador con sesión los ve siempre: así puede ensayar la
// presentación antes de hacerlos públicos. No se exponen correos ni datos de
// contacto: nombres de equipo, integrantes, lugar y premio.
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { getSession, revalidarMiembro } from '@/lib/auth';
import { listarGanadores } from '@/lib/ganadores';

function publico(ganador) {
  return {
    id_ganador: ganador.id_ganador,
    id_reto: ganador.id_reto,
    posicion: ganador.posicion,
    titulo: ganador.titulo,
    premio: ganador.premio,
    tipo: ganador.tipo,
    nombre: ganador.nombre,
    institucion: ganador.institucion ?? null,
    integrantes: (ganador.integrantes || []).map((p) => ({
      nombre: p.nombre,
      es_capitan: Boolean(p.es_capitan),
      institucion: p.institucion ?? null,
    })),
  };
}

export async function GET(request, { params }) {
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de evento inválido' }, { status: 400 });
  }

  const client = await connectWithRetry();
  try {
    const ev = await client.query(
      `SELECT e.id_evento, e.nombre, e.fecha_inicio, e.fecha_fin, e.resultados_publicados,
              e.imagen_flyer_url, t.nombre AS tipo_nombre, c.modalidad, t.permite_equipos, c.id_concurso
         FROM evento e
         LEFT JOIN catalogo_tipo_evento t ON t.id_tipo_evento = e.id_tipo_evento
         LEFT JOIN concurso c ON c.id_evento = e.id_evento
        WHERE e.id_evento = $1 AND e.deleted_at IS NULL
          AND e.estado IN ('publicado', 'en_curso', 'finalizado')`,
      [id],
    );
    if (ev.rows.length === 0) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    const evento = ev.rows[0];

    // Administrador con sesión vigente: ve los resultados aunque no estén
    // publicados (para ensayar la presentación). El rol se revalida contra la
    // base, no se confía en el claim del JWT.
    let esAdmin = false;
    const session = await getSession(request);
    if (session) {
      const { vigente, rol } = await revalidarMiembro(session.id);
      esAdmin = vigente && (rol || session.role || '').toLowerCase() === 'administrador';
    }

    const publicado = Boolean(evento.resultados_publicados);
    if (!publicado && !esAdmin) {
      return NextResponse.json(
        { publicado: false, evento: { id_evento: evento.id_evento, nombre: evento.nombre }, general: [], retos: [] },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { general, retos, total } = await listarGanadores(client, id);
    const aDia = (v) => (v instanceof Date ? v.toISOString().split('T')[0] : v ?? null);

    return NextResponse.json(
      {
        publicado,
        vista_previa: !publicado && esAdmin,
        evento: {
          id_evento: Number(evento.id_evento),
          nombre: evento.nombre,
          tipo: evento.tipo_nombre,
          fecha_inicio: aDia(evento.fecha_inicio),
          fecha_fin: aDia(evento.fecha_fin),
          imagen_url: evento.imagen_flyer_url,
          por_equipos: Boolean(evento.permite_equipos && evento.id_concurso && evento.modalidad === 'equipos'),
        },
        total,
        general: general.map(publico),
        retos: retos.map((r) => ({
          id_reto: r.id_reto,
          titulo: r.titulo,
          slug: r.slug,
          tono: r.tono,
          patrocinador: r.patrocinador,
          ganadores: r.ganadores.map(publico),
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Error en GET /api/eventos/[id]/ganadores:', error);
    return NextResponse.json({ error: 'Error al obtener los ganadores' }, { status: 500 });
  } finally {
    client.release();
  }
}
