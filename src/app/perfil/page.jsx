'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import PerfilUsuario from '@/components/perfil/PerfilUsuario';

/**
 * Perfil del usuario, accesible a CUALQUIER usuario autenticado.
 *
 * Antes esta pantalla vivía en /admin/perfil, bajo un layout envuelto en
 * <ProtectedRoute adminOnly>: un miembro que pulsara "Mi perfil" era expulsado
 * a /dashboard, es decir, nadie salvo los administradores podía llegar a su
 * propio perfil. Y /dashboard era una copia casi idéntica de esa misma vista.
 *
 * El guard va POR ENCIMA de todo el contenido a propósito: en la versión
 * anterior los `return` tempranos del spinner se ejecutaban antes de montar
 * ProtectedRoute, así que si la sesión no se podía verificar la página se
 * quedaba en "Cargando…" para siempre sin redirigir nunca a /iniciar.
 */
export default function PerfilPage() {
  return (
    <ProtectedRoute>
      <PerfilUsuario />
    </ProtectedRoute>
  );
}
