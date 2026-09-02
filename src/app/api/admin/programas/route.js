import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';
import { rangoFechasInvalido } from '@/lib/programas-fechas';
import { validarDiasSemana, generarSesiones } from '@/lib/programas-db';

// GET - Listar todos los programas recurrentes
export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    client = await connectWithRetry();
    // Subconsultas escalares en vez de dos LEFT JOIN + GROUP BY: aquellos
    // materializaban el producto cartesiano sesiones × inscripciones (3.000 filas
    // intermedias para un curso de 30 sesiones y 100 inscritos) solo para contar.
    // El filtro `estado <> 'cancelada'` es el MISMO que usa el catálogo público,
    // para que el panel y /programas no muestren dos cifras distintas.
    // Las fechas salen como 'YYYY-MM-DD' (TO_CHAR) y no como instante ISO: si no,
    // el navegador del usuario pinta el día anterior.
    const result = await client.query(`
      SELECT
        pr.id_programa,
        pr.nombre,
        pr.descripcion,
        TO_CHAR(pr.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
        TO_CHAR(pr.fecha_fin, 'YYYY-MM-DD')    AS fecha_fin,
        pr.id_tipo_evento,
        pr.id_alcance,
        pr.sesiones_requeridas_certificado,
        pr.porcentaje_asistencia_minimo,
        pr.ubicacion,
        pr.imagen_url,
        pr.activo,
        pr.solicitar_talla,
        pr.dias_semana,
        pr.hora_inicio,
        pr.hora_fin,
        pr.created_at,
        pr.updated_at,
        te.nombre AS tipo_evento,
        ae.nombre AS alcance,
        (SELECT COUNT(*) FROM sesion_programa sp
          WHERE sp.id_programa = pr.id_programa)::int AS total_sesiones,
        (SELECT COUNT(*) FROM inscripcion_programa ip
          WHERE ip.id_programa = pr.id_programa AND ip.estado <> 'cancelada')::int AS total_inscritos
      FROM programa_recurrente pr
      LEFT JOIN catalogo_tipo_evento te ON pr.id_tipo_evento = te.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento ae ON pr.id_alcance = ae.id_alcance
      ORDER BY pr.fecha_inicio DESC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching programas:', error);
    return NextResponse.json({ error: 'Error al obtener programas' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

// POST - Crear nuevo programa
export async function POST(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    client = await connectWithRetry();
    const {
      nombre,
      descripcion,
      fecha_inicio,
      fecha_fin,
      id_tipo_evento,
      id_alcance,
      sesiones_requeridas_certificado,
      porcentaje_asistencia_minimo,
      ubicacion,
      imagen_url,
      dias_semana, // Array de números [1, 3, 5] (Lunes, Miércoles, Viernes)
      hora_inicio,
      hora_fin,
      activo,
      solicitar_talla,
    } = await request.json();

    if (!nombre) return NextResponse.json({ error: 'El nombre del programa es obligatorio.' }, { status: 400 });
    if (!fecha_inicio) return NextResponse.json({ error: 'La fecha de inicio es obligatoria.' }, { status: 400 });
    if (!fecha_fin) return NextResponse.json({ error: 'La fecha de fin es obligatoria.' }, { status: 400 });
    if (!id_tipo_evento) return NextResponse.json({ error: 'El tipo de evento es obligatorio.' }, { status: 400 });
    if (!id_alcance) return NextResponse.json({ error: 'El alcance es obligatorio.' }, { status: 400 });

    // El programa no tiene CHECK de fechas en la DB (a diferencia de evento), así que
    // lo validamos aquí: si fecha_fin < fecha_inicio el bucle generaría 0 sesiones.
    if (rangoFechasInvalido(fecha_inicio, fecha_fin)) {
      return NextResponse.json({ error: 'La fecha de fin debe ser igual o posterior a la de inicio.' }, { status: 400 });
    }
    const errorDias = validarDiasSemana(dias_semana);
    if (errorDias) return NextResponse.json({ error: errorDias }, { status: 400 });

    // Sin horas no se materializa ni una sesión: antes se respondía 201 y el
    // admin creía haber configurado un curso que en realidad estaba vacío.
    if (Array.isArray(dias_semana) && dias_semana.length > 0 && (!hora_inicio || !hora_fin)) {
      return NextResponse.json(
        { error: 'Para generar las sesiones automáticamente necesitas indicar hora de inicio y hora de fin.' },
        { status: 400 },
      );
    }

    await client.query('BEGIN');

    // porcentaje: respetar un 0 explícito (no caer a 80 con ||).
    const pctMin = (porcentaje_asistencia_minimo === undefined || porcentaje_asistencia_minimo === null || porcentaje_asistencia_minimo === '')
      ? 80.0 : Number(porcentaje_asistencia_minimo);

    const result = await client.query(
      `INSERT INTO programa_recurrente (
        nombre, descripcion, fecha_inicio, fecha_fin,
        id_tipo_evento, id_alcance, sesiones_requeridas_certificado,
        porcentaje_asistencia_minimo, ubicacion, imagen_url,
        dias_semana, hora_inicio, hora_fin, activo, solicitar_talla
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        nombre,
        // La descripción sale al público por /api/programas: se sanea al guardar,
        // igual que en eventos, para no dejar HTML envenenado esperando a la
        // primera vista que lo renderice.
        descripcion == null ? null : sanitizeHtml(descripcion),
        fecha_inicio,
        fecha_fin,
        id_tipo_evento,
        id_alcance,
        Number.isFinite(Number(sesiones_requeridas_certificado)) ? Number(sesiones_requeridas_certificado) : 0,
        pctMin,
        ubicacion,
        imagen_url,
        (Array.isArray(dias_semana) && dias_semana.length > 0) ? dias_semana : null,
        hora_inicio || null,
        hora_fin || null,
        typeof activo === 'boolean' ? activo : true,
        Boolean(solicitar_talla),
      ],
    );

    const programaId = result.rows[0].id_programa;

    const sesionesGeneradas = await generarSesiones(client, {
      programaId,
      fechaInicio: fecha_inicio,
      fechaFin: fecha_fin,
      diasSemana: dias_semana,
      horaInicio: hora_inicio,
      horaFin: hora_fin,
      ubicacion,
    });

    await client.query('COMMIT');

    // El contador viaja en la respuesta para que la UI diga cuántas sesiones se
    // crearon en lugar de un "Programa creado" que no distingue 0 de 12.
    return NextResponse.json(
      { ...result.rows[0], sesiones_generadas: sesionesGeneradas },
      { status: 201 },
    );
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    console.error('Error creating programa:', error);
    return NextResponse.json({ error: 'Error al crear programa' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
