// src/app/api/programas/route.js
// Listado PÚBLICO de programas recurrentes (talleres/cursos) activos, para que
// los usuarios los vean y se inscriban. No requiere auth.
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const programas = await sql`
      SELECT
        p.id_programa,
        p.nombre,
        p.descripcion,
        p.fecha_inicio,
        p.fecha_fin,
        p.ubicacion,
        p.imagen_url,
        p.dias_semana,
        p.hora_inicio,
        p.hora_fin,
        p.sesiones_requeridas_certificado,
        p.porcentaje_asistencia_minimo,
        t.nombre AS tipo,
        a.nombre AS alcance,
        (SELECT COUNT(*) FROM sesion_programa sp WHERE sp.id_programa = p.id_programa) AS total_sesiones,
        (SELECT COUNT(*) FROM inscripcion_programa ip WHERE ip.id_programa = p.id_programa AND ip.estado <> 'cancelada') AS total_inscritos
      FROM programa_recurrente p
      LEFT JOIN catalogo_tipo_evento t ON p.id_tipo_evento = t.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento a ON p.id_alcance = a.id_alcance
      WHERE p.activo = true
      ORDER BY p.fecha_inicio DESC
    `;

    const formateados = programas.map(p => {
      // Estado temporal para la UI según el rango de fechas del programa.
      let estado = 'future';
      const ini = p.fecha_inicio ? new Date(p.fecha_inicio).toISOString().split('T')[0] : null;
      const fin = p.fecha_fin ? new Date(p.fecha_fin).toISOString().split('T')[0] : ini;
      if (fin && fin < today) estado = 'past';
      else if (ini && ini <= today && fin >= today) estado = 'en_curso';

      return {
        ...p,
        fecha_inicio: ini,
        fecha_fin: fin,
        hora_inicio: p.hora_inicio?.toString?.() ?? null,
        hora_fin: p.hora_fin?.toString?.() ?? null,
        total_sesiones: Number(p.total_sesiones) || 0,
        total_inscritos: Number(p.total_inscritos) || 0,
        estado,
      };
    });

    return NextResponse.json(formateados);
  } catch (error) {
    console.error('Error en GET /api/programas:', error);
    if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) {
      return NextResponse.json(
        { error: 'Error de conexión con la base de datos. Intente nuevamente.', code: 'DB_CONNECTION_ERROR' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Error al obtener programas' }, { status: 500 });
  }
}
