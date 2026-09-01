import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';
import { aFechaISO } from '@/lib/programas-fechas';
import { recalcularEstadisticasPrograma } from '@/lib/programas-db';

// GET - Listar sesiones de un programa (con su asistencia agregada)
export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de programa inválido' }, { status: 400 });
  }
  const client = await connectWithRetry();

  try {
    // `sp.*` devolvía `fecha` (DATE) como instante ISO completo y la tabla del
    // panel imprimía "Invalid Date" en TODAS las filas. Va como 'YYYY-MM-DD'.
    // total_inscritos = inscritos ACTIVOS al PROGRAMA (denominador de asistencia);
    // sin el filtro de estado, los dados de baja inflaban el porcentaje.
    // asistentes_presentes = quienes tienen asistio=true en ESTA sesión,
    // sumando miembros e invitados.
    const result = await client.query(
      `SELECT
        sp.id_sesion,
        sp.id_programa,
        sp.id_evento,
        sp.numero_sesion,
        sp.titulo,
        sp.descripcion,
        sp.es_obligatoria,
        TO_CHAR(sp.fecha, 'YYYY-MM-DD') AS fecha,
        sp.hora_inicio,
        sp.hora_fin,
        sp.ubicacion,
        sp.created_at,
        (SELECT COUNT(*) FROM inscripcion_programa ip
          WHERE ip.id_programa = sp.id_programa AND ip.estado <> 'cancelada')::int AS total_inscritos,
        (
          COALESCE((SELECT COUNT(*) FROM asistencia_miembro  am WHERE am.id_sesion = sp.id_sesion AND am.asistio), 0) +
          COALESCE((SELECT COUNT(*) FROM asistencia_invitado ai WHERE ai.id_sesion = sp.id_sesion AND ai.asistio), 0)
        )::int AS asistentes_presentes
      FROM sesion_programa sp
      WHERE sp.id_programa = $1
      ORDER BY sp.numero_sesion`,
      [id],
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching sesiones:', error);
    return NextResponse.json({ error: 'Error al obtener sesiones' }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST - Agregar una sesión manual al programa (fecha/hora propias, sin evento espejo)
export async function POST(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'ID de programa inválido' }, { status: 400 });
  }
  const client = await connectWithRetry();

  try {
    const {
      numero_sesion,
      titulo,
      descripcion,
      fecha,
      hora_inicio,
      hora_fin,
      ubicacion,
      es_obligatoria,
    } = await request.json();

    if (!fecha) {
      return NextResponse.json({ error: 'La fecha de la sesión es requerida' }, { status: 400 });
    }
    // Comparar 'HH:MM' como cadenas es válido y evita construir Dates.
    if (hora_inicio && hora_fin && hora_fin <= hora_inicio) {
      return NextResponse.json(
        { error: 'La hora de fin debe ser posterior a la hora de inicio.' },
        { status: 400 },
      );
    }

    // La sesión debe caer dentro del periodo del programa: si no, cuenta para el
    // denominador del certificado de un curso al que no pertenece.
    const prog = await client.query(
      `SELECT TO_CHAR(fecha_inicio, 'YYYY-MM-DD') AS inicio,
              TO_CHAR(fecha_fin, 'YYYY-MM-DD')    AS fin
         FROM programa_recurrente WHERE id_programa = $1`,
      [id],
    );
    if (prog.rows.length === 0) {
      return NextResponse.json({ error: 'El programa no existe' }, { status: 404 });
    }
    const fechaISO = aFechaISO(fecha);
    const { inicio, fin } = prog.rows[0];
    if (!fechaISO || fechaISO < inicio || fechaISO > fin) {
      return NextResponse.json(
        { error: `La fecha de la sesión debe estar entre ${inicio} y ${fin}, el periodo del programa.` },
        { status: 400 },
      );
    }

    await client.query('BEGIN');

    // numero_sesion: si no llega, calcular el siguiente.
    let numero = parseInt(numero_sesion);
    if (!Number.isInteger(numero) || numero <= 0) {
      const maxRes = await client.query(
        'SELECT COALESCE(MAX(numero_sesion), 0)::int AS max FROM sesion_programa WHERE id_programa = $1',
        [id],
      );
      numero = maxRes.rows[0].max + 1;
    }

    const result = await client.query(
      `INSERT INTO sesion_programa (
        id_programa, numero_sesion, titulo, descripcion,
        fecha, hora_inicio, hora_fin, ubicacion, es_obligatoria
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id_sesion`,
      [
        id,
        numero,
        titulo || null,
        descripcion == null || descripcion === '' ? null : sanitizeHtml(descripcion),
        fechaISO,
        hora_inicio || null,
        hora_fin || null,
        ubicacion || null,
        es_obligatoria !== false,
      ],
    );

    // Añadir una sesión obligatoria cambia el denominador del certificado: hay que
    // rehacer los porcentajes persistidos (los triggers solo cuelgan de asistencia).
    await recalcularEstadisticasPrograma(client, id);

    await client.query('COMMIT');

    const creada = await client.query(
      `SELECT id_sesion, id_programa, numero_sesion, titulo, descripcion, es_obligatoria,
              TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, hora_inicio, hora_fin, ubicacion
         FROM sesion_programa WHERE id_sesion = $1`,
      [result.rows[0].id_sesion],
    );

    return NextResponse.json(creada.rows[0], { status: 201 });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error adding sesion:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe una sesión con ese número en el programa' },
        { status: 409 },
      );
    }
    if (error.code === '23503') {
      return NextResponse.json({ error: 'El programa no existe' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Error al agregar sesión' }, { status: 500 });
  } finally {
    client.release();
  }
}
