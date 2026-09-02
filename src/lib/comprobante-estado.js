// Estados del comprobante de pago y cómo se pintan. Módulo SIN dependencias a
// propósito: lo importan tanto rutas de servidor como componentes de cliente
// (el panel admin, el de staff y el modal público), y `comprobantes-pago.js`
// arrastra `crypto` y no puede viajar al navegador.

export const ESTADOS_COMPROBANTE = Object.freeze(['pendiente', 'aprobado', 'rechazado']);

/** Tono de <Badge> por estado (mismo criterio en admin, staff y público). */
export const TONO_COMPROBANTE = Object.freeze({
  aprobado: 'success',
  pendiente: 'warning',
  rechazado: 'danger',
});

/** Etiqueta para el panel de quien revisa. */
export const ETIQUETA_COMPROBANTE = Object.freeze({
  aprobado: 'Pago validado',
  pendiente: 'Por revisar',
  rechazado: 'Rechazado',
});

/** Etiqueta para quien pagó (misma información, redactada hacia el inscrito). */
export const ETIQUETA_COMPROBANTE_INSCRITO = Object.freeze({
  aprobado: 'Pago validado',
  pendiente: 'Comprobante en revisión',
  rechazado: 'Comprobante rechazado',
});
