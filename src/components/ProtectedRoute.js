'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Puerta de acceso del cliente.
 *
 * Antes, mientras se verificaba la sesión, devolvía una pantalla vacía con la
 * palabra "Cargando..." centrada a pantalla completa. Como envuelve al panel
 * entero, cada entrada a /admin borraba la interfaz (sidebar incluido) y sólo
 * después montaba la página, que recién entonces empezaba a pedir sus datos:
 * tres saltos en serie con la pantalla en blanco entre medias. De ahí la
 * sensación de que "las secciones tardan mucho en cargar".
 *
 * Ahora el estado de espera es un esqueleto que conserva el layout, y quien
 * llama puede sustituirlo por uno con la forma exacta de su contenido mediante
 * `fallback`.
 */
function EsqueletoPorDefecto() {
  return (
    <div className="w-full space-y-4 p-6" role="status" aria-label="Comprobando sesión">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-64 w-full" />
      <span className="sr-only">Comprobando sesión…</span>
    </div>
  );
}

export default function ProtectedRoute({ children, adminOnly = false, fallback }) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/iniciar');
    } else if (adminOnly && !isAdmin()) {
      router.push('/dashboard');
    }
  }, [user, loading, adminOnly, isAdmin, router]);

  const permitido = !!user && (!adminOnly || isAdmin());
  if (loading || !permitido) {
    return fallback ?? <EsqueletoPorDefecto />;
  }

  return children;
}
