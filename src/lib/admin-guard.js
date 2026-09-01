// Invariantes de la tabla `miembro` compartidas por las rutas del panel.
//
// Había TRES caminos capaces de dejar el sistema sin ningún administrador
// (PUT /api/admin/miembros, PUT /api/admin/miembros/[id]/rol y DELETE) y sólo
// el DELETE contaba administradores antes de actuar. Degradar al último admin
// dejaba /admin inaccesible para todo el mundo, sin ninguna pantalla desde la
// que recuperarse: había que entrar a la base de datos a mano. La regla vive
// aquí una sola vez para que los tres caminos no vuelvan a divergir.

export const ROLES_VALIDOS = new Set(['administrador', 'staff', 'usuario']);

// 'egresado' es un valor admitido por el CHECK de la tabla y el estado natural
// de quien se gradúa; faltaba en la lista, así que el panel sólo podía marcar
// 'inactivo' o 'baja' y se perdía la distinción.
export const ESTADOS_VALIDOS = new Set(['activo', 'inactivo', 'egresado', 'baja']);

export const MENSAJE_ULTIMO_ADMIN =
  'No se puede degradar ni dar de baja al último administrador activo del sistema.';

/**
 * Devuelve el mensaje de error si el cambio dejaría al sistema sin
 * administradores activos, o `null` si es seguro aplicarlo.
 *
 * `actual` debe ser la fila YA bloqueada con `SELECT ... FOR UPDATE` dentro de
 * la misma transacción: sin el bloqueo, dos degradaciones simultáneas leen "hay
 * 2 administradores" y ambas pasan (TOCTOU).
 */
export async function motivoBloqueoUltimoAdmin(client, actual, { rol, estado } = {}) {
  if (!actual || actual.rol !== 'administrador' || actual.estado !== 'activo') return null;

  const pierdeRol = rol !== undefined && rol !== 'administrador';
  const pierdeActividad = estado !== undefined && estado !== 'activo';
  if (!pierdeRol && !pierdeActividad) return null;

  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM miembro
      WHERE rol = 'administrador' AND estado = 'activo' AND deleted_at IS NULL`,
  );

  return rows[0].count <= 1 ? MENSAJE_ULTIMO_ADMIN : null;
}

/**
 * `miembro.rol = 'staff'` no es un rol que se elija a mano: significa "tiene
 * asignaciones en staff_evento". Lo mantienen los endpoints de staff, que
 * promueven a 'staff' al asignar y devuelven a 'usuario' al quitar la última
 * asignación.
 *
 * Por eso, degradar a 'usuario' a alguien que sigue siendo staff de un evento
 * rompería ese invariante y le quitaría acceso a su propio evento. En ese caso
 * el rol efectivo es 'staff', no 'usuario'.
 */
export async function normalizarRolConStaff(client, idMiembro, rolSolicitado) {
  if (rolSolicitado !== 'usuario') return rolSolicitado;

  const { rows } = await client.query(
    'SELECT 1 FROM staff_evento WHERE id_miembro = $1 LIMIT 1',
    [idMiembro],
  );

  return rows.length > 0 ? 'staff' : 'usuario';
}
