// src/app/api/programas/[id]/route.js
// Detalle PÚBLICO de un programa + sus sesiones (para la página de inscripción).
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db-server';

export async function GET(request, { params }) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ error: 'ID de programa inválido' }, { status: 400 });
  }

  try {
    const rows = await sql`
      SELECT
        p.id_programa, p.nombre, p.descripcion, p.fecha_inicio, p.fecha_fin,
        p.ubicacion, p.imagen_url, p.dias_semana, p.hora_inicio, p.hora_fin,
        p.sesiones_requeridas_certificado, p.porcentaje_asistencia_minimo, p.activo,
        t.nombre AS tipo, a.nombre AS alcance,
        (SELECT COUNT(*) FROM inscripcion_programa ip WHERE ip.id_programa = p.id_programa AND ip.estado <> 'cancelada') AS total_inscritos
      FROM programa_recurrente p
      LEFT JOIN catalogo_tipo_evento t ON p.id_tipo_evento = t.id_tipo_evento
      LEFT JOIN catalogo_alcance_evento a ON p.id_alcance = a.id_alcance
      WHERE p.id_programa = ${idNum}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 });
    }
    const programa = rows[0];

    const sesiones = await sql`
      SELECT id_sesion, numero_sesion, titulo, descripcion, fecha, hora_inicio, hora_fin, ubicacion, es_obligatoria
      FROM sesion_programa
      WHERE id_programa = ${idNum}
      ORDER BY numero_sesion ASC, fecha ASC
    `;

    return NextResponse.json({
      ...programa,
      fecha_inicio: programa.fecha_inicio ? new Date(programa.fecha_inicio).toISOString().split('T')[0] : null,
      fecha_fin: programa.fecha_fin ? new Date(programa.fecha_fin).toISOString().split('T')[0] : null,
      hora_inicio: programa.hora_inicio?.toString?.() ?? null,
      hora_fin: programa.hora_fin?.toString?.() ?? null,
      total_inscritos: Number(programa.total_inscritos) || 0,
      sesiones: sesiones.map(s => ({
        ...s,
        fecha: s.fecha ? new Date(s.fecha).toISOString().split('T')[0] : null,
        hora_inicio: s.hora_inicio?.toString?.() ?? null,
        hora_fin: s.hora_fin?.toString?.() ?? null,
      })),
    });
  } catch (error) {
    console.error('Error en GET /api/programas/[id]:', error);
    return NextResponse.json({ error: 'Error al obtener el programa' }, { status: 500 });
  }
}
