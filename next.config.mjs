/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'utfs.io',
        port: '',
        pathname: '/f/**', // Permite cualquier imagen bajo la ruta /f/
      },
      {
        protocol: 'https',
        hostname: '*.ufs.sh', // Para cubrir subdominios específicos de usuario/app de UploadThing
        port: '',
        pathname: '/f/**',
      },
        {
        protocol: 'https',
        hostname: '*.googleusercontent.com', // Si usas imágenes de Google
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'uploadthing.com', // Por si acaso UploadThing usa otros subdominios o rutas
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
