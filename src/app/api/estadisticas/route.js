import { sql } from '@/lib/db-server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const [miembrosRes, problemasRes, eventosRes] = await Promise.all([
      // `deleted_at IS NULL` es redundante con estado='activo' mientras el panel
      // mantenga ambos campos en sync, pero deja la intencion explicita y cubre
      // cualquier fila que quede a medias.
      sql`SELECT COUNT(*) as total FROM miembro WHERE estado = 'activo' AND deleted_at IS NULL`,
      // El SUM iba sobre cuenta_plataforma a secas: los problemas resueltos de un
      // miembro dado de baja seguian sumando al contador publico de la home,
      // porque la baja es LOGICA y sus cuentas siguen con activo = true.
      sql`SELECT COALESCE(SUM(cp.problemas_resueltos_total), 0) as total
            FROM cuenta_plataforma cp
            JOIN miembro m ON m.id_miembro = cp.id_miembro
           WHERE cp.activo = true
             AND m.deleted_at IS NULL
             AND m.estado = 'activo'`,
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
