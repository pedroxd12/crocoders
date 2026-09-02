// Permisos de un rol de staff por evento (`catalogo_rol_staff`), definidos en
// un solo sitio.
//
// La tabla tiene tres banderas (puede_ver, puede_editar, puede_administrar),
// pero hasta ahora sólo el escáner QR las leía: el resto del panel de staff
// mostraba los mismos botones a todo el mundo (y el servidor respondía 403 al
// pulsarlos), y validar comprobantes de pago lo permitía a cualquier asignado
// sin mirar el rol. Los roles "Apoyo" y "Juez" parecían vacíos porque, en la
// práctica, nada distinguía a un rol de otro.
//
// Aquí se fija qué significa cada nivel. Lo leen la UI (para no ofrecer lo que
// el servidor va a negar) y los gates del servidor
// (`autorizarStaffEvento` en src/lib/checkin-eventos.js):
//
//   consulta   puede_ver           ve inscritos, tallas y datos del evento; exporta la lista
//   operacion  + puede_editar      escanea QR, marca llegadas y playeras, valida comprobantes
//   gestion    + puede_administrar además marca asistencia y pago a mano desde la lista
//
// `puede_ver` no se comprueba: estar asignado en `staff_evento` ya es ver.
// Es un módulo sin dependencias de servidor: se importa desde componentes.

export const NIVEL_STAFF = Object.freeze({
  CONSULTA: 'consulta',
  OPERACION: 'operacion',
  GESTION: 'gestion',
});

/**
 * Banderas efectivas de un rol. `puede_administrar` implica `puede_editar`
 * aunque el catálogo tenga la segunda en false: quien gestiona también opera.
 */
export function permisosDeRol(rol) {
  const gestionar = Boolean(rol?.puede_administrar);
  const operar = gestionar || Boolean(rol?.puede_editar);
  return { ver: true, operar, gestionar };
}

export function nivelDeRol(rol) {
  const p = permisosDeRol(rol);
  if (p.gestionar) return NIVEL_STAFF.GESTION;
  if (p.operar) return NIVEL_STAFF.OPERACION;
  return NIVEL_STAFF.CONSULTA;
}

export const ETIQUETA_NIVEL = Object.freeze({
  consulta: 'Solo consulta',
  operacion: 'Operación',
  gestion: 'Gestión',
});

/** Tonos de <Badge>. */
export const TONO_NIVEL = Object.freeze({
  consulta: 'neutral',
  operacion: 'info',
  gestion: 'success',
});

/** Qué puede hacer cada nivel, redactado para el administrador que asigna. */
export const DESCRIPCION_NIVEL = Object.freeze({
  consulta: 'Ve la lista de inscritos, las tallas y los datos del evento, y puede exportarla. No marca nada.',
  operacion: 'Además escanea el QR de acceso, marca llegadas y entrega de playeras y valida comprobantes de pago.',
  gestion: 'Además marca asistencia y pago a mano desde la lista, sin necesidad del QR.',
});

/** Frase corta para la cabecera del panel de staff. */
export function describirRol(rol) {
  const nivel = nivelDeRol(rol);
  const nombre = rol?.rol || rol?.nombre || 'Staff';
  return `${nombre} · ${ETIQUETA_NIVEL[nivel]}`;
}
