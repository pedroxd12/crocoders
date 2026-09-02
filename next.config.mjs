/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production';

// Content-Security-Policy.
//
// Sin CSP, cualquier inyección de HTML en la página (una descripción de evento,
// un nombre de miembro…) puede cargar y ejecutar scripts de dominios ajenos.
// Aquí se declara explícitamente de dónde puede venir cada tipo de recurso.
//
// Notas sobre las excepciones:
//  - `unsafe-inline` / `unsafe-eval` en script-src: Next.js inyecta scripts
//    inline de arranque y el runtime de Spline compila WASM. Aun con ellas, la
//    lista de orígenes impide cargar un `<script src="https://malo/">`.
//  - gstatic/unpkg en connect-src: Spline descarga de ahí el decodificador
//    Draco y sus módulos WASM cuando la escena 3D los necesita.
//  - fonts.gstatic.com en font-src: la escena de Spline referencia esa fuente
//    (las de la web se auto-alojan con next/font).
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "frame-src 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  [
    "img-src 'self' data: blob:",
    'https://utfs.io',
    'https://*.ufs.sh',
    'https://uploadthing.com',
    'https://lh3.googleusercontent.com',
    'https://userpic.codeforces.org',
    'https://secure.gravatar.com',
    'https://www.gravatar.com',
  ].join(' '),
  [
    "connect-src 'self'",
    'https://api.uploadthing.com',
    'https://*.ingest.uploadthing.com',
    'https://*.ufs.sh',
    'https://utfs.io',
    'https://fonts.gstatic.com',
    'https://www.gstatic.com',
    'https://unpkg.com',
    // El servidor de desarrollo usa websockets para el hot reload.
    ...(isDev ? ['ws:', 'wss:'] : []),
  ].join(' '),
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig = {
  poweredByHeader: false,
  compress: true,
  // Permite abrir el servidor de desarrollo desde otros dispositivos de la red
  // local (probar desde el móvil con la IP de la máquina) sin que Next bloquee
  // los assets de dev por cross-origin. Sólo aplica a `next dev`.
  allowedDevOrigins: ['192.168.1.*'],
  // Paquetes que NO deben pasar por el bundler del servidor. Además de los
  // nativos (pg/sharp/bcryptjs), 'isomorphic-dompurify' arrastra jsdom, que usa
  // requires dinámicos y revienta al inicializar la función serverless en Vercel
  // (la ruta responde con la página 500 estática antes de ejecutar el handler).
  serverExternalPackages: ['pg', 'pg-native', 'sharp', 'bcryptjs', 'cheerio', 'isomorphic-dompurify', 'jsdom'],
  images: {
    formats: ['image/avif', 'image/webp'],
    // Permitir SVG remoto (algunos archivos de UploadThing / avatares lo son).
    // Se sirven con CSP sandbox y como adjunto para mitigar XSS de SVG malicioso.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'utfs.io',
        port: '',
        pathname: '/f/**',
      },
      {
        protocol: 'https',
        hostname: '*.ufs.sh',
        port: '',
        pathname: '/f/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**',
      },
      {
        protocol: 'https',
        hostname: 'uploadthing.com',
        port: '',
        pathname: '/f/**',
      },
      {
        protocol: 'https',
        hostname: 'userpic.codeforces.org',
        port: '',
        pathname: '/**',
      },
      // Fotos de perfil de omegaUp (sirve los avatares vía Gravatar).
      {
        protocol: 'https',
        hostname: 'secure.gravatar.com',
        port: '',
        pathname: '/avatar/**',
      },
      {
        protocol: 'https',
        hostname: 'www.gravatar.com',
        port: '',
        pathname: '/avatar/**',
      },
      // api.qrserver.com se quitó a propósito: los tickets de acceso ya no se
      // mandan a un generador de QR de terceros, los dibuja /api/eventos/qr.
    ],
  },
  async headers() {
    const securityHeaders = [
      { key: 'Content-Security-Policy', value: CSP_DIRECTIVES },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
    ];

    // HSTS solo en producción: en local se sirve por http y forzaría https.
    if (!isDev) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
