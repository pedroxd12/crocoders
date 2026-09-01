import { redirect } from 'next/navigation';

/**
 * /dashboard era una copia de /admin/perfil: la misma vista de perfil, los
 * mismos formularios y los mismos bugs, mantenidos por duplicado. Ahora existe
 * una sola implementación en /perfil, accesible a cualquier usuario
 * autenticado.
 *
 * La ruta se conserva como redirección porque el login, el proxy, el
 * encabezado del sitio y ProtectedRoute siguen enviando aquí a los usuarios no
 * administradores; que esos puntos apunten directamente a /perfil es un cambio
 * aparte, fuera de esta vista.
 */
export default function DashboardPage() {
  redirect('/perfil');
}
