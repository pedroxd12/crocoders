// src/app/evidencias/page.js
//
// Server Component: consulta la línea de tiempo EN EL SERVIDOR para que las
// actividades viajen ya dentro del HTML, en vez de pedirlas tras hidratar.
import { listarTimelineEvidencias } from '@/lib/evidencias-listado';
import EvidenciasClient from './EvidenciasClient';

// `listarTimelineEvidencias` habla con Postgres por el driver `pg`, no por
// `fetch`: sin esta línea Next da la página por estática, ejecuta la consulta
// una sola vez durante el build y sirve una galería congelada hasta el
// siguiente despliegue.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Evidencias',
  description:
    'Galería de fotos de las conferencias, talleres y concursos organizados por el club Crocoders.',
  alternates: { canonical: '/evidencias' },
};

export default async function EvidenciasPage() {
  let timelineInicial;
  try {
    timelineInicial = await listarTimelineEvidencias();
  } catch (error) {
    // Un fallo de base no debe dejar la página en blanco: se manda el HTML sin
    // datos y SWR reintenta desde el cliente, igual que hacía antes.
    console.error('Error al precargar evidencias en el servidor:', error);
    timelineInicial = undefined;
  }

  return <EvidenciasClient timelineInicial={timelineInicial} />;
}
