import { redirect } from 'next/navigation';

/**
 * "Mi perfil" ya no vive dentro del panel de administración.
 *
 * Estaba bajo src/app/admin/layout.jsx, que envuelve todo en
 * <ProtectedRoute adminOnly>, así que la pantalla del perfil personal sólo era
 * alcanzable por administradores; el resto de miembros era expulsado a
 * /dashboard. Encima la página montaba un SEGUNDO ProtectedRoute y un
 * `min-h-screen` con cabecera propia dentro del shell del panel: dos guardas,
 * dos contenedores y dos cabeceras compitiendo con el sidebar.
 *
 * La vista única está en /perfil. Esta redirección existe para que el enlace
 * del sidebar del panel siga funcionando mientras se actualiza; cuando apunte
 * a /perfil, este archivo puede borrarse.
 */
export default function AdminPerfilPage() {
  redirect('/perfil');
}
