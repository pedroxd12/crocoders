import { Poppins } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Crocoders — Club de Algoritmia ITLAC',
    template: '%s · Crocoders',
  },
  description:
    'Club de algoritmia y programación competitiva del ITLAC. Conferencias, talleres, concursos y comunidad para crecer como ingeniero.',
  keywords: ['Crocoders', 'ITLAC', 'algoritmia', 'programación competitiva', 'Codeforces', 'OmegaUp', 'VJudge'],
  authors: [{ name: 'Crocoders' }],
  applicationName: 'Crocoders',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Crocoders',
    title: 'Crocoders — Club de Algoritmia ITLAC',
    description: 'Club de algoritmia y programación competitiva del ITLAC.',
    url: siteUrl,
    locale: 'es_MX',
    images: [
      {
        url: '/img/logo.png',
        width: 600,
        height: 600,
        alt: 'Logo de Crocoders',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Crocoders — Club de Algoritmia ITLAC',
    description: 'Club de algoritmia y programación competitiva del ITLAC.',
    images: ['/img/logo.png'],
  },
  icons: {
    icon: '/img/logo.png',
    apple: '/img/logo.png',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport = {
  themeColor: '#0f1014',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        {/* Pre-descarga de la escena 3D para que esté lista cuando el usuario
            llegue a la sección del teclado. */}
        <link
          rel="preload"
          href="/teclado/skills-keyboard.splinecode"
          as="fetch"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${poppins.className} bg-gray-900 min-h-screen flex flex-col font-sans`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
