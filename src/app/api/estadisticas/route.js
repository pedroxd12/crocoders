import { sql } from '@/lib/db-server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const [miembrosRes, problemasRes, eventosRes] = await Promise.all([
      sql`SELECT COUNT(*) as total FROM miembro WHERE estado = 'activo'`,
      sql`SELECT COALESCE(SUM(problemas_resueltos_total), 0) as total FROM cuenta_plataforma WHERE activo = true`,
      sql`SELECT COUNT(*) as total FROM evento WHERE estado IN ('publicado', 'en_curso', 'finalizado')`
    ]);

    const estadisticas = {
      miembros: parseInt(miembrosRes[0]?.total || 0),
      problemas: parseInt(problemasRes[0]?.total || 0),
      eventos: parseInt(eventosRes[0]?.total || 0),
      años: new Date().getFullYear() - 2023 // O un valor fijo si prefieres
    };

    return NextResponse.json(estadisticas);

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    return NextResponse.json({
      error: "Error al obtener estadísticas del servidor.",
    }, {
      status: 500
    });
  }
}
