import HackaitlacLanding from '@/components/hackaitlac/HackaitlacLanding';

const description =
  'Hackatón de 24 horas del Instituto Tecnológico de Lázaro Cárdenas. 5 desafíos reales, equipos de 5 integrantes más asesor y $15,000 MXN al primer lugar de cada desafío. 8 y 9 de octubre de 2026.';

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

export default function HackaitlacPage() {
  return <HackaitlacLanding />;
}
