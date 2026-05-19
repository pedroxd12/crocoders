/**
 * Constantes compartidas de roles y tipos.
 *
 * Hay dos dominios distintos:
 *  - APP_ROLES: rol funcional del miembro almacenado en `miembro.rol` (BD).
 *  - INSCRIPCION_TIPO: discriminador del tipo de inscripción a un evento.
 *
 * Importar siempre desde aquí en lugar de usar strings literales.
 */

export const APP_ROLES = Object.freeze({
  ADMIN: 'administrador',
  MEMBER: 'usuario',
  STAFF: 'staff',
});

export const APP_ROLE_VALUES = Object.freeze(Object.values(APP_ROLES));

export const INSCRIPCION_TIPO = Object.freeze({
  MIEMBRO: 'miembro',
  INVITADO: 'invitado',
  EQUIPO: 'equipo',
});

export const isAdminRole = (role) => role === APP_ROLES.ADMIN;
export const isMemberRole = (role) => role === APP_ROLES.MEMBER;
export const isStaffRole = (role) => role === APP_ROLES.STAFF || role === APP_ROLES.ADMIN;
