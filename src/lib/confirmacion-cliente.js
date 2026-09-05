// Disparo del correo de confirmación desde el navegador, tras inscribirse.
//
// El servidor (/api/confirmation) sólo acepta el ticket firmado: de él saca
// la inscripción, el evento y TODOS los destinatarios (en un equipo, cada
// integrante y asesor). Antes esta función vivía copiada en el listado y en el
// detalle de eventos, y mandaba `email`/`name`/`eventDetails` que el servidor
// ignora desde el endurecimiento de agosto de 2026.

/**
 * @param {string} qrToken ticket firmado que devolvió el registro
 * @returns {Promise<{enviados: number, destinatarios: number}>}
 */
export async function enviarCorreoConfirmacion(qrToken) {
  if (!qrToken) throw new Error('Sin ticket de inscripción');
  const response = await fetch('/api/confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrToken }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'No se pudo enviar el correo de confirmación');
  }
  return { enviados: result.enviados ?? 1, destinatarios: result.destinatarios ?? 1 };
}
