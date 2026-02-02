
import { NextResponse } from 'next/server';
import pool from '@/lib/db-server';

export async function GET() {
  const client = await pool.connect();
  try {
    // 1. Members count
    const membersRes = await client.query("SELECT COUNT(*) FROM miembro WHERE estado = 'activo'");
    const activeMembers = parseInt(membersRes.rows[0].count);

    // 2. Events count
    const eventsRes = await client.query("SELECT COUNT(*) FROM evento WHERE deleted_at IS NULL AND estado = 'publicado'");
    const totalEvents = parseInt(eventsRes.rows[0].count);

    // 3. Financial Summary
    // Sum of completed payments based on inscriptions marked as paid * event cost
    // This covers both manual checks and automated payments (assuming algo updates pago_completado)
    const financeRes = await client.query(`
        SELECT SUM(e.costo) as total 
        FROM inscripcion_evento ie
        JOIN evento e ON ie.id_evento = e.id_evento
        WHERE ie.pago_completado = true
    `);
    const totalRevenue = parseFloat(financeRes.rows[0].total || 0);

    // 4. Recent Inscriptions (last 5)
    // Joined with event name and user name
    const recentRes = await client.query(`
      SELECT 
        ie.fecha_inscripcion, 
        e.nombre as evento,
        COALESCE(m.nombre || ' ' || m.apellido_paterno, i.nombre_completo) as usuario,
        ie.estado
      FROM inscripcion_evento ie
      JOIN evento e ON ie.id_evento = e.id_evento
      LEFT JOIN miembro m ON ie.id_miembro = m.id_miembro
      LEFT JOIN invitado i ON ie.id_invitado = i.id_invitado
      ORDER BY ie.fecha_inscripcion DESC
      LIMIT 5
    `);
    
    // 5. Event Summaries (top 5 recent)
    const eventStatsRes = await client.query(`
        SELECT 
            e.id_evento,
            e.nombre,
            e.fecha_inicio,
            COUNT(ie.id_inscripcion) as registrados,
            COUNT(CASE WHEN ie.asistio THEN 1 END) as asistentes
        FROM evento e
        LEFT JOIN inscripcion_evento ie ON e.id_evento = ie.id_evento
        WHERE e.deleted_at IS NULL
        GROUP BY e.id_evento
        ORDER BY e.fecha_inicio DESC
        LIMIT 5
    `);

    return NextResponse.json({
      activeMembers,
      totalEvents,
      totalRevenue,
      recentInscriptions: recentRes.rows,
      eventStats: eventStatsRes.rows
    });
  } catch (error) {
    console.error('Stats Error:', error);
    return NextResponse.json({ error: 'Error fetching stats' }, { status: 500 });
  } finally {
    client.release();
  }
}
