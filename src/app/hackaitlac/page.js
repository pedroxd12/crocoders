import HackaitlacLanding from '@/components/hackaitlac/HackaitlacLanding';
import { DESAFIOS_FALLBACK } from '@/components/hackaitlac/desafios-fallback';
import { obtenerLandingEvento } from '@/lib/hackaitlac';

const description =
  'Hackatón de 24 horas del Instituto Tecnológico de Lázaro Cárdenas. Desafíos reales de la industria y el gobierno de la región, equipos de estudiantes y premio al primer lugar de cada desafío.';

export const metadata = {
  title: 'HackaItlac 2026 — Segunda Edición',
  description,
  keywords: [
    'HackaItlac',
    'hackatón',
    'ITLAC',
    'TecNM Lázaro Cárdenas',
    'innovación',
    'prototipos',
    'convocatoria 2026',
  ],
  alternates: { canonical: '/hackaitlac' },
  openGraph: {
    title: 'HackaItlac 2026 — Segunda Edición',
    description,
    url: '/hackaitlac',
    type: 'website',
    locale: 'es_MX',
    images: [
      { url: '/hackaitlac/logo.png', width: 626, height: 856, alt: 'Logotipo HackaItlac 2026' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HackaItlac 2026 — Segunda Edición',
    description,
    images: ['/hackaitlac/logo.png'],
  },
};

export const viewport = {
  themeColor: '#0A1E49',
};

// OBLIGATORIO, por el mismo motivo que en /eventos: los desafíos y sus cupos se
// leen de Postgres con el driver `pg`, no con `fetch`, así que sin esto Next da
// la página por estática, ejecuta la consulta UNA vez durante el build y sirve
// cupos congelados hasta el siguiente despliegue.
export const dynamic = 'force-dynamic';

export default async function HackaitlacPage() {
  // El evento que alimenta esta página es el que el panel marcó con
  // `slug = 'hackaitlac'` (campo «Identificador de página propia»).
  let datos = null;
  try {
    datos = await obtenerLandingEvento('hackaitlac');
  } catch (error) {
    // Que la base falle no puede dejar la convocatoria en blanco: se sirve el
    // contenido de respaldo, que es la convocatoria tal y como se publicó.
    console.error('No se pudo leer el evento del HackaItlac:', error);
  }

  if (!datos) {
    console.warn(
      '[hackaitlac] Sin evento con slug "hackaitlac": se publica el contenido de respaldo. ' +
        'Crea el evento en /admin/eventos, ponle ese identificador y da de alta sus desafíos.',
    );
  }

  return (
    <HackaitlacLanding
      // El respaldo entra sólo cuando NO hay evento configurado. Si lo hay y
      // tiene todos los desafíos retirados, se respeta esa decisión y la
      // sección no se pinta, en vez de resucitar la convocatoria vieja.
      challenges={datos ? datos.challenges : DESAFIOS_FALLBACK}
      evento={datos?.evento ?? null}
    />
  );
}
