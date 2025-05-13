import { sql } from '@/lib/db-server';

export async function GET() {
  try {
    // Consultas a la base de datos
    const [miembros, problemas, eventos] = await Promise.all([
      sql`SELECT COUNT(*) as total FROM miembro`,
      sql`SELECT SUM(problemas_total) as total FROM (
        SELECT problemas_total FROM codeforces
        UNION ALL
        SELECT problemas_total FROM omegaup
        UNION ALL
        SELECT problemas_total FROM vjudge
      ) as problemas`,
      sql`SELECT COUNT(*) as total FROM evento`
    ]);

    const estadisticas = {
      miembros: parseInt(miembros[0].total) || 0,
      problemas: parseInt(problemas[0].total) || 0,
      eventos: parseInt(eventos[0].total) || 0,
      años: 1 
    };

    return new Response(JSON.stringify(estadisticas), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    return new Response(JSON.stringify({ 
      miembros: 50,
      problemas: 100,
      eventos: 30,
      años: 1
    }), {
      status: 200, // Devuelve 200 con valores por defecto incluso en error
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}