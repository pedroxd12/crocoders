// src/app/evidencias/loading.js
//
// Permite a Next mandar el armazón de la página de inmediato y transmitir la
// línea de tiempo cuando la consulta termina, en lugar de retener el primer
// byte hasta entonces.
import LoadingSpinner from '@/components/LoadingSpinner';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner size="lg" text="Cargando línea del tiempo..." />
    </div>
  );
}
