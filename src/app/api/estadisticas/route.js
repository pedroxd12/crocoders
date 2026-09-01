import { sql } from '@/lib/db-server';
import { NextResponse } from 'next/server';

// Año en que se fundó el club. Estaba incrustado en la resta que calcula la
// antigüedad; aquí al menos tiene nombre y un solo sitio donde corregirlo.
const ANIO_FUNDACION = 2023;

// Endpoint público y sin sesión que lanza tres agregados contra `miembro`,
// `cuenta_plataforma` y `evento`. Se sirve desde la caché de la CDN para que
// golpearlo en bucle no se traduzca en consultas a la base: los números cambian
// como mucho cada pocos minutos.
const CACHE_GET = 'public, s-maxage=300, stale-while-revalidate=86400';

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
      años: new Date().getFullYear() - ANIO_FUNDACION
    };

    return NextResponse.json(estadisticas, {
      headers: { 'Cache-Control': CACHE_GET },
    });

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    return NextResponse.json({
      error: "Error al obtener estadísticas del servidor.",
    }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
