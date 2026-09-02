// PATCH /api/eventos/comprobantes/[id]
// Validación del comprobante de pago: aprobar, rechazar o devolver a revisión.
//
// La usan DOS paneles con el mismo contrato: el de administración
// (/admin/eventos/[id]/asistentes) y el de staff (/staff/eventos/[id]). Por eso
// no vive bajo /api/admin: el gate es "administrador O staff asignado a ESTE
// evento" (ver puedeValidarPagos), la misma regla que el resto del panel de
// staff. Con requireStaff bastaría el rol para tocar eventos ajenos.
import { NextResponse } from 'next/server';
import { connectWithRetry } from '@/lib/db-server';
import { requireAuth } from '@/lib/auth';
import { comprobanteRevisionSchema, parseOrError } from '@/lib/validation';
import { puedeValidarPagos } from '@/lib/comprobantes-pago';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const guard = await requireAuth(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const idComprobante = Number(id);
  if (!Number.isInteger(idComprobante) || idComprobante <= 0) {
    return NextResponse.json({ success: false, error: 'ID de comprobante inválido' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo de la petición no es JSON válido' }, { status: 400 });
  }

  const [data, errPayload] = parseOrError(comprobanteRevisionSchema, body);
  if (errPayload) return NextResponse.json(errPayload, { status: 400 });

  let client;
  try {
    client = await connectWithRetry();
  } catch (error) {
    console.error('Error de conexión al revisar comprobante:', error);
    return NextResponse.json(
      { success: false, error: 'No se pudo conectar con la base de datos. Intenta de nuevo.', code: 'DB_CONNECTION_ERROR' },
      { status: 503 },
    );
  }

  try {
    await client.query('BEGIN');

    // FOR UPDATE del comprobante: dos personas del staff revisando la misma
    // fila a la vez dejarían la inscripción y el comprobante en desacuerdo.
    const { rows: filas } = await client.query(
      `SELECT cp.id_comprobante, cp.estado, ie.id_inscripcion, ie.id_evento, ie.estado AS estado_inscripcion
         FROM comprobante_pago cp
         JOIN inscripcion_evento ie ON ie.id_inscripcion = cp.id_inscripcion
        WHERE cp.id_comprobante = $1
        FOR UPDATE OF cp`,
      [idComprobante],
    );

    const comprobante = filas[0];
    if (!comprobante) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: 'Comprobante no encontrado' }, { status: 404 });
    }

    if (!(await puedeValidarPagos(client, guard.session, comprobante.id_evento))) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para validar pagos de este evento.' },
        { status: 403 },
      );
    }

    const aprobado = data.estado === 'aprobado';
    const revisorId = Number(guard.session.id) || null;

    const { rows: actualizado } = await client.query(
      // Los dos `::varchar` NO sobran: sin ellos Postgres deduce un tipo para
      // $1 en el SET (varchar) y otro en el CASE (text) y rechaza la consulta
      // entera con 42P08 "inconsistent types deduced for parameter $1".
      `UPDATE comprobante_pago
          SET estado = $1::varchar,
              motivo_rechazo = $2,
              revisado_por = $3,
              -- 'pendiente' es "devolver a revisión": se borra el veredicto
              -- anterior para que el panel no muestre quién lo revisó ya.
              revisado_en = CASE WHEN $1::varchar = 'pendiente' THEN NULL ELSE NOW() END
        WHERE id_comprobante = $4
        RETURNING id_comprobante, id_inscripcion, imagen_url, referencia, monto_declarado,
                  estado, motivo_rechazo, subido_en, revisado_en`,
      [
        data.estado,
        data.estado === 'rechazado' ? data.motivo_rechazo : null,
        data.estado === 'pendiente' ? null : revisorId,
        idComprobante,
      ],
    );

    // El estado de pago que consulta el RESTO del sistema (correos, listados,
    // check-in) sigue siendo el de la inscripción: aprobar el comprobante es lo
    // que lo mueve. Al aprobar se confirma la inscripción, igual que hace el
    // toggle manual de /api/eventos/inscripciones/[id]; al retirar la aprobación
    // vuelve a 'pendiente' porque en un evento con costo eso es lo que era.
    const { rows: inscripcion } = await client.query(
      `UPDATE inscripcion_evento
          SET pago_completado = $1,
              estado = CASE
                         WHEN $1 = true THEN 'confirmada'
                         WHEN estado = 'confirmada' THEN 'pendiente'
                         ELSE estado
                       END,
              updated_at = NOW()
        WHERE id_inscripcion = $2
        RETURNING id_inscripcion, estado, pago_completado`,
      [aprobado, comprobante.id_inscripcion],
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      comprobante: actualizado[0],
      inscripcion: inscripcion[0],
      // `name` es el nombre completo que firma el JWT al iniciar sesión.
      revisado_por: guard.session.name || null,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error en ROLLBACK:', rollbackError);
    }
    console.error('Error al revisar el comprobante de pago:', error);
    return NextResponse.json({ success: false, error: 'No se pudo actualizar el comprobante.' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
