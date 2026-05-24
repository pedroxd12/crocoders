import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';
import { requireAdmin } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';

// GET - Listar todos los programas recurrentes
export async function GET(request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(`
      SELECT 
        pr.*,
        te.nombre as tipo_evento,
        ae.nombre as alcance,
        COUNT(DISTINCT sp.id_sesion) as total_sesiones,
        COUNT(DISTINCT ip.id_inscripcion_programa) as total_inscritos
      FROM programa_recurrente pr
      LEFT JOIN catalogo_tipo_evento te ON pr.id_tipo_evento = te.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento ae ON pr.id_alcance = ae.id_alcance
      LEFT JOIN sesion_programa sp ON pr.id_programa = sp.id_programa
      LEFT JOIN inscripcion_programa ip ON pr.id_programa = ip.id_programa
      GROUP BY pr.id_programa, te.nombre, ae.nombre
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
    client = await pool.connect();
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
      hora_fin
    } = await request.json();

    if (!nombre || !fecha_inicio || !fecha_fin || !id_tipo_evento || !id_alcance) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
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
        dias_semana, hora_inicio, hora_fin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        nombre,
        descripcion,
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
      ],
    );

    const programaId = result.rows[0].id_programa;

    if (dias_semana && dias_semana.length > 0 && hora_inicio && hora_fin) {
      // Materializar sesiones SIN crear eventos espejo en el catálogo público.
      // Cada sesión lleva su propia fecha/hora/ubicación.
      // Las fechas vienen como YYYY-MM-DD; las tratamos como UTC para que
      // getUTCDay() devuelva el día correcto en cualquier servidor.
      const start = new Date(`${fecha_inicio}T00:00:00Z`);
      const end = new Date(`${fecha_fin}T00:00:00Z`);

      let sessionCount = 1;
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        if (!dias_semana.includes(d.getUTCDay())) continue;

        const fechaStr = d.toISOString().split('T')[0];

        await client.query(
          `INSERT INTO sesion_programa (
            id_programa, numero_sesion, titulo, descripcion,
            fecha, hora_inicio, hora_fin, ubicacion
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            programaId,
            sessionCount,
            `Sesión ${sessionCount}`,
            sanitizeHtml(descripcion || ''),
            fechaStr,
            hora_inicio,
            hora_fin,
            ubicacion || null,
          ],
        );

        sessionCount++;
      }
    }

    await client.query('COMMIT');

    return NextResponse.json(result.rows[0], { status: 201 });
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
