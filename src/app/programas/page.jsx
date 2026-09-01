// src/app/programas/page.jsx
//
// Server Component: consulta el catálogo EN EL SERVIDOR para que los programas
// viajen ya dentro del HTML, en vez de pedirlos después de hidratar.
import { listarProgramasPublicos } from '@/lib/programas-listado';
import ProgramasClient from './ProgramasClient';

// `listarProgramasPublicos` habla con Postgres por el driver `pg`, no por
// `fetch`: sin esta línea Next da la página por estática, ejecuta la consulta
// una sola vez durante el build y sirve un catálogo congelado hasta el
// siguiente despliegue.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Programas y talleres',
  description:
    'Cursos y talleres recurrentes del club Crocoders. Inscríbete y acredita tu participación asistiendo a las sesiones.',
  alternates: { canonical: '/programas' },
};

export default async function ProgramasPage() {
  let programasIniciales;
  try {
    programasIniciales = await listarProgramasPublicos();
  } catch (error) {
    // Un fallo de base no debe dejar la página en blanco: se manda el HTML sin
    // datos y SWR reintenta desde el cliente, igual que hacía antes.
    console.error('Error al precargar programas en el servidor:', error);
    programasIniciales = undefined;
  }

  return <ProgramasClient programasIniciales={programasIniciales} />;
}
