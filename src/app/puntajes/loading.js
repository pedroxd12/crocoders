// src/app/puntajes/loading.js
//
// Permite a Next mandar el armazón de la página de inmediato y transmitir la
// tabla cuando la consulta a la base termina, en vez de retener el primer byte.
import LoadingSpinner from '@/components/LoadingSpinner';

export default function Loading() {
  return <LoadingSpinner fullScreen text="Cargando puntajes..." />;
}
