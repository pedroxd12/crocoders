// POST /api/eventos/comprobante/estado
// Estado del pago de UNA inscripción, para quien se inscribió.
//
// Es POST y no GET a propósito: la credencial es el ticket firmado y en una
// query string acabaría en los logs del servidor y en la cabecera Referer.
// Mismo criterio que /api/eventos/qr.
import { NextResponse } from 'next/server';
import { query } from '@/lib/db-server';
import { rateLimit } from '@/lib/rate-limit';
import { resolverInscripcionDeToken, comprobantePublico } from '@/lib/comprobantes-pago';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const rl = rateLimit(request, { scope: 'comprobante-estado', limit: 120, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Demasiadas consultas. Intenta más tarde.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  try {
    const resuelto = await resolverInscripcionDeToken(
      // `query()` de db-server (reintenta ante ECONNRESET); nunca pool.query().
      { query: (text, values) => query(text, values) },
      body?.qrToken,
    );
    if (!resuelto.ok) {
      return NextResponse.json({ success: false, error: resuelto.error }, { status: resuelto.status });
    }

    const i = resuelto.inscripcion;
    return NextResponse.json({
      success: true,
      evento: {
        id_evento: i.id_evento,
        nombre: i.nombre_evento,
        costo: i.costo != null ? Number(i.costo) : null,
        instrucciones_pago: i.instrucciones_pago || null,
      },
      estado_inscripcion: i.estado,
      pago_completado: Boolean(i.pago_completado),
      comprobante: comprobantePublico(i),
    });
  } catch (error) {
    console.error('Error al consultar el estado del comprobante:', error);
    return NextResponse.json({ success: false, error: 'No se pudo consultar el estado del pago.' }, { status: 500 });
  }
}
