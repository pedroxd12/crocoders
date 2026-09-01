// src/app/eventos/loading.jsx
//
// Con este archivo Next transmite la respuesta en dos tramos: manda de
// inmediato el armazón de la página con este indicador y, cuando la consulta a
// la base termina, envía la lista por el mismo flujo HTTP.
//
// Importa porque page.jsx ahora consulta la base antes de responder: sin
// `loading`, el navegador se quedaría esperando el primer byte hasta que esa
// consulta acabara (~0.5 s) y no podría empezar a bajar el CSS ni el JS. Con
// él, la cabecera llega igual de rápido que cuando la página era estática y la
// descarga de recursos corre en paralelo con la consulta.
import LoadingSpinner from '@/components/LoadingSpinner';

export default function Loading() {
  return <LoadingSpinner fullScreen text="Cargando eventos..." />;
}
