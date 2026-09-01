import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';
import { UTApi } from "uploadthing/server";
import { rangoFechasInvalido } from '@/lib/programas-fechas';
import {
  validarDiasSemana,
  generarSesiones,
  borrarSesionesSinAsistencia,
  contarSesionesFueraDeRango,
  renumerarSesiones,
  recalcularEstadisticasPrograma,
} from '@/lib/programas-db';

const utapi = new UTApi();

async function deleteFromUploadThing(keys) {
  if (!keys || keys.length === 0) return;
  try {
    await utapi.deleteFiles(keys);
  } catch (e) {
    console.error('Error eliminando archivos de UploadThing:', e);
  }
}

// Un id no numérico llegaba a Postgres y explotaba con 22P02 → 500. Es un 400.
function idInvalido(id) {
  return !id || !Number.isInteger(Number(id)) || Number(id) <= 0;
}

// Columnas explícitas + fechas como 'YYYY-MM-DD': `pr.*` devolvía las DATE como
// instante ISO y el navegador pintaba el día anterior. Los contadores van como
// subconsultas escalares (no como JOIN + GROUP BY) para no materializar el
// producto cartesiano sesiones × inscripciones.
const SELECT_PROGRAMA = `
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
  WHERE pr.id_programa = $1
`;

// GET - Obtener detalles de un programa
export async function GET(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (idInvalido(id)) {
    return NextResponse.json({ error: 'ID de programa inválido' }, { status: 400 });
  }
  const client = await connectWithRetry();

  try {
    const result = await client.query(SELECT_PROGRAMA, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching programa:', error);
    return NextResponse.json(
      { error: 'Error al obtener programa' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// PUT - Actualizar programa
export async function PUT(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (idInvalido(id)) {
    return NextResponse.json({ error: 'ID de programa inválido' }, { status: 400 });
  }
  const client = await connectWithRetry();

  try {
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
      activo,
      // El formulario SÍ enviaba estos tres campos, pero el PUT los descartaba en
      // silencio: se guardaba "Programa actualizado" y el horario seguía igual.
      dias_semana,
      hora_inicio,
      hora_fin,
      // Política explícita ante un cambio de calendario: sin esta bandera no se
      // toca ninguna sesión, solo se avisa de cuántas quedan fuera del rango.
      regenerar_sesiones,
    } = await request.json();

    // Validación de campos obligatorios (NOT NULL en el schema), nombrando el campo.
    if (!nombre) return NextResponse.json({ error: 'El nombre del programa es obligatorio.' }, { status: 400 });
    if (!fecha_inicio) return NextResponse.json({ error: 'La fecha de inicio es obligatoria.' }, { status: 400 });
    if (!fecha_fin) return NextResponse.json({ error: 'La fecha de fin es obligatoria.' }, { status: 400 });
    if (!id_tipo_evento) return NextResponse.json({ error: 'El tipo de evento es obligatorio.' }, { status: 400 });
    if (!id_alcance) return NextResponse.json({ error: 'El alcance es obligatorio.' }, { status: 400 });

    // Misma guarda que el POST: la tabla no tiene CHECK de fechas.
    if (rangoFechasInvalido(fecha_inicio, fecha_fin)) {
      return NextResponse.json({ error: 'La fecha de fin debe ser igual o posterior a la de inicio.' }, { status: 400 });
    }
    const errorDias = validarDiasSemana(dias_semana);
    if (errorDias) return NextResponse.json({ error: errorDias }, { status: 400 });

    const quiereRegenerar = regenerar_sesiones === true;
    if (quiereRegenerar && (!Array.isArray(dias_semana) || dias_semana.length === 0 || !hora_inicio || !hora_fin)) {
      return NextResponse.json(
        { error: 'Para regenerar las sesiones necesitas indicar días de la semana y horas de inicio y fin.' },
        { status: 400 },
      );
    }

    // Respetar un 0 explícito en el porcentaje (no caer a 80).
    const pctMin = (porcentaje_asistencia_minimo === undefined || porcentaje_asistencia_minimo === null || porcentaje_asistencia_minimo === '')
      ? 80.0 : Number(porcentaje_asistencia_minimo);

    // Transacción: si la regeneración falla, el programa no queda con las fechas
    // nuevas y las sesiones a medio borrar.
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE programa_recurrente SET
        nombre = $1,
        descripcion = $2,
        fecha_inicio = $3,
        fecha_fin = $4,
        id_tipo_evento = $5,
        id_alcance = $6,
        sesiones_requeridas_certificado = $7,
        porcentaje_asistencia_minimo = $8,
        ubicacion = $9,
        imagen_url = $10,
        activo = COALESCE($11, activo),
        -- Solo se sobrescribe el horario si el cuerpo lo trae: un cliente que no
        -- envíe estos campos no debe borrar el horario ya guardado. Y cuando sí
        -- los trae, un array vacío significa "sin días", no "no tocar".
        dias_semana = CASE WHEN $12::boolean THEN $13::int[]  ELSE dias_semana END,
        hora_inicio = CASE WHEN $14::boolean THEN $15::time   ELSE hora_inicio END,
        hora_fin    = CASE WHEN $16::boolean THEN $17::time   ELSE hora_fin    END,
        updated_at = NOW()
      WHERE id_programa = $18
      RETURNING id_programa`,
      [
        nombre,
        descripcion == null ? null : sanitizeHtml(descripcion),
        fecha_inicio,
        fecha_fin,
        id_tipo_evento,
        id_alcance,
        Number.isFinite(Number(sesiones_requeridas_certificado)) ? Number(sesiones_requeridas_certificado) : 0,
        pctMin,
        ubicacion ?? null,
        imagen_url ?? null,
        typeof activo === 'boolean' ? activo : null,
        dias_semana !== undefined,
        (Array.isArray(dias_semana) && dias_semana.length > 0) ? dias_semana : null,
        hora_inicio !== undefined,
        hora_inicio || null,
        hora_fin !== undefined,
        hora_fin || null,
        id,
      ],
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 });
    }

    let sesionesRegeneradas = 0;
    let sesionesConservadas = 0;

    if (quiereRegenerar) {
      // Se borran solo las sesiones SIN asistencia: las que ya tienen registro
      // son el historial del participante y se conservan aunque queden fuera del
      // nuevo rango.
      const borrado = await borrarSesionesSinAsistencia(client, id);
      sesionesConservadas = borrado.conservadas;
      sesionesRegeneradas = await generarSesiones(client, {
        programaId: id,
        fechaInicio: fecha_inicio,
        fechaFin: fecha_fin,
        diasSemana: dias_semana,
        horaInicio: hora_inicio,
        horaFin: hora_fin,
        ubicacion,
      });
      // Renumerar aunque no se haya creado ninguna: si solo se borraron sesiones,
      // el "#" de la tabla quedaría con huecos.
      await renumerarSesiones(client, id);
      // Cambió el denominador de sesiones obligatorias: hay que rehacer los
      // porcentajes persistidos (los triggers solo cuelgan de las asistencias).
      await recalcularEstadisticasPrograma(client, id);
    }

    // Aviso honesto: cuántas sesiones quedan fuera del periodo declarado.
    const sesionesFueraDeRango = await contarSesionesFueraDeRango(client, id, fecha_inicio, fecha_fin);

    await client.query('COMMIT');

    const actualizado = await client.query(SELECT_PROGRAMA, [id]);

    return NextResponse.json({
      ...actualizado.rows[0],
      sesiones_fuera_de_rango: sesionesFueraDeRango,
      sesiones_regeneradas: sesionesRegeneradas,
      sesiones_conservadas: sesionesConservadas,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error updating programa:', error);
    if (error.code === '23503') {
      return NextResponse.json({ error: 'Tipo de evento o alcance inválido' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Error al actualizar programa' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// DELETE - Eliminar programa
export async function DELETE(request, { params }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (idInvalido(id)) {
    return NextResponse.json({ error: 'ID de programa inválido' }, { status: 400 });
  }
  const client = await connectWithRetry();

  try {
    // Recolectar los storage_key de las evidencias del programa ANTES del cascade,
    // para no dejar archivos huérfanos en UploadThing al borrarse las filas.
    const evidRes = await client.query(
      'SELECT storage_key FROM evidencia WHERE id_programa = $1 AND storage_key IS NOT NULL',
      [id],
    );
    const evidenciaKeys = evidRes.rows.map((r) => r.storage_key);

    // Por la cascada, esto eliminará automáticamente sesiones, inscripciones y evidencias.
    const result = await client.query(
      'DELETE FROM programa_recurrente WHERE id_programa = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Programa no encontrado' },
        { status: 404 }
      );
    }

    // Best-effort: limpiar los archivos del CDN tras el borrado en BD.
    if (evidenciaKeys.length > 0) {
      deleteFromUploadThing(evidenciaKeys);
    }

    return NextResponse.json({ message: 'Programa eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting programa:', error);
    return NextResponse.json(
      { error: 'Error al eliminar programa' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
