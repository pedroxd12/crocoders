// Comprobantes de pago de inscripciones a eventos con costo (migración 013).
//
// Lo comparten CUATRO caminos que si no duplicarían las mismas reglas:
//   - el middleware de UploadThing que autoriza la subida del archivo,
//   - POST/GET /api/eventos/comprobante (flujo público del inscrito),
//   - PATCH /api/eventos/comprobantes/[id] (revisión de staff y admin),
//   - los listados de asistentes del panel admin y del panel de staff.
//
// CREDENCIAL DEL INSCRITO
// -----------------------
// Quien sube el comprobante puede no tener cuenta (invitados y equipos con
// integrantes externos), así que no hay sesión que comprobar. Se reutiliza el
// MISMO ticket firmado del QR de acceso (src/lib/qr-token.js): lo recibe quien
// acaba de inscribirse y quien abre su correo de confirmación, va firmado con
// PAYLOAD_SECRET y ya identifica inscripción + evento. Aceptar el id de
// inscripción suelto permitiría subirle (o mirarle) el comprobante a cualquiera
// recorriendo 1, 2, 3…

import { verificarQrToken } from '@/lib/qr-token';
import { autorizarStaffEvento } from '@/lib/checkin-eventos';

/**
 * Columnas del comprobante para los listados de asistentes. Se escriben una
 * sola vez para que el panel admin y el de staff muestren exactamente lo mismo.
 * Espera que la consulta tenga `LEFT JOIN comprobante_pago cp ON ...`.
 */
export const SQL_COLUMNAS_COMPROBANTE = `
        cp.id_comprobante,
        cp.imagen_url  AS comprobante_url,
        cp.referencia  AS comprobante_referencia,
        cp.monto_declarado AS comprobante_monto,
        cp.estado      AS comprobante_estado,
        cp.motivo_rechazo AS comprobante_motivo_rechazo,
        cp.subido_en   AS comprobante_subido_en,
        cp.revisado_en AS comprobante_revisado_en,
        TRIM(CONCAT(rev.nombre, ' ', rev.apellido_paterno)) AS comprobante_revisado_por`;

/** JOINs que acompañan a SQL_COLUMNAS_COMPROBANTE. */
export const SQL_JOIN_COMPROBANTE = `
      LEFT JOIN comprobante_pago cp ON cp.id_inscripcion = ie.id_inscripcion
      LEFT JOIN miembro rev ON rev.id_miembro = cp.revisado_por`;

/**
 * Resuelve el ticket firmado a una inscripción REAL y comprueba que el evento
 * admita comprobante. Devuelve { ok: true, inscripcion } o { ok: false, error,
 * status } con el motivo ya redactado para el usuario.
 *
 * `client` es cualquier cosa con `.query(text, values)`: un cliente de la
 * transacción o el pool.
 */
export async function resolverInscripcionDeToken(client, qrToken) {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) {
    console.error('PAYLOAD_SECRET no configurado: no se puede verificar el ticket de inscripción.');
    return { ok: false, status: 500, error: 'El servidor no está configurado para recibir comprobantes.' };
  }

  const payload = verificarQrToken(qrToken, secret);
  if (!payload) {
    return { ok: false, status: 400, error: 'Credencial de inscripción no válida. Vuelve a abrir tu ticket de acceso.' };
  }

  const { rows } = await client.query(
    `SELECT ie.id_inscripcion, ie.id_evento, ie.estado, ie.pago_completado,
            e.nombre AS nombre_evento, e.tiene_costo, e.costo, e.instrucciones_pago,
            cp.id_comprobante, cp.imagen_url, cp.imagen_key, cp.estado AS comprobante_estado,
            cp.motivo_rechazo, cp.referencia, cp.monto_declarado, cp.subido_en
       FROM inscripcion_evento ie
       JOIN evento e ON e.id_evento = ie.id_evento
       LEFT JOIN comprobante_pago cp ON cp.id_inscripcion = ie.id_inscripcion
      WHERE ie.id_inscripcion = $1`,
    [payload.id],
  );

  const inscripcion = rows[0];
  if (!inscripcion) {
    return { ok: false, status: 404, error: 'La inscripción de este ticket ya no existe.' };
  }
  // El token trae el evento firmado: si no coincide con el de la fila, el
  // ticket no es de esta inscripción (o los datos cambiaron bajo los pies).
  if (Number(inscripcion.id_evento) !== payload.eid) {
    return { ok: false, status: 400, error: 'La credencial no corresponde a este evento.' };
  }
  if (inscripcion.estado === 'cancelada') {
    return { ok: false, status: 400, error: 'Esta inscripción está cancelada.' };
  }
  if (!inscripcion.tiene_costo) {
    return { ok: false, status: 400, error: 'Este evento no tiene costo: no necesita comprobante de pago.' };
  }

  return { ok: true, inscripcion };
}

/**
 * ¿Puede esta sesión validar pagos del evento?
 *
 * Administrador siempre; el resto sólo si está asignado como staff de ESE
 * evento con un rol de operación (`puede_editar` o `puede_administrar`). Es
 * exactamente la misma regla que el escáner QR: antes bastaba con estar
 * asignado, así que un rol de "solo consulta" (Apoyo, Juez) no podía marcar
 * una llegada pero sí aprobar un pago.
 */
export async function puedeValidarPagos(client, session, idEvento) {
  const permiso = await autorizarStaffEvento(client, session, idEvento);
  return permiso.ok;
}

/** Forma que consume la UI pública (no expone claves de almacenamiento). */
export function comprobantePublico(fila) {
  if (!fila?.id_comprobante) return null;
  return {
    id_comprobante: fila.id_comprobante,
    imagen_url: fila.imagen_url,
    estado: fila.comprobante_estado,
    motivo_rechazo: fila.motivo_rechazo ?? null,
    referencia: fila.referencia ?? null,
    monto_declarado: fila.monto_declarado != null ? Number(fila.monto_declarado) : null,
    subido_en: fila.subido_en ?? null,
  };
}
