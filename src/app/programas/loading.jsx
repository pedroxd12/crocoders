// src/app/programas/loading.jsx
//
// Permite a Next mandar el armazón de la página de inmediato y transmitir el
// catálogo cuando la consulta a la base termina, en lugar de retener el primer
// byte hasta entonces. Así el navegador empieza a bajar CSS y JS en paralelo
// con la consulta.
import LoadingSpinner from '@/components/LoadingSpinner';

export default function Loading() {
  return <LoadingSpinner fullScreen showText text="Cargando programas..." />;
}
