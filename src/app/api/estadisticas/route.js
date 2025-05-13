import { sql } from '@/lib/db-server';
import { NextResponse } from 'next/server'; // Importar NextResponse

export async function GET() {
  try {
    // Consultas a la base de datos
    const [miembrosRes, problemasRes, eventosRes] = await Promise.all([
      sql`SELECT COUNT(*) as total FROM miembro`,
      sql`SELECT COALESCE(SUM(pt.problemas_total_coalesced), 0) as total 
           FROM (
             SELECT COALESCE(problemas_total, 0) as problemas_total_coalesced FROM codeforces
             UNION ALL
             SELECT COALESCE(problemas_total, 0) as problemas_total_coalesced FROM omegaup
             UNION ALL
             SELECT COALESCE(problemas_total, 0) as problemas_total_coalesced FROM vjudge
           ) pt`, // Se asegura que los NULLs se manejen y la suma sea 0 por defecto
      sql`SELECT COUNT(*) as total FROM evento`
    ]);

    const estadisticas = {
      miembros: parseInt(miembrosRes[0]?.total || 0), // Agregado ?. y valor por defecto por seguridad
      problemas: parseInt(problemasRes[0]?.total || 0), // problemasRes[0].total ahora siempre debería ser un número
      eventos: parseInt(eventosRes[0]?.total || 0),
      años: 1 // Asumiendo que este valor es fijo o se calcula de otra manera
    };

    return NextResponse.json(estadisticas); // Usar NextResponse.json

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    // Devolver una respuesta de error apropiada
    return NextResponse.json({
      error: "Error al obtener estadísticas del servidor.",
    }, {
      status: 500 // Error Interno del Servidor
    });
  }
}