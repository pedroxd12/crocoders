'use client';

import { usePathname } from 'next/navigation';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { AuthProvider } from '@/context/AuthContext';

export default function AppShell({ children }) {
  const pathname = usePathname();
  // El panel admin (/admin/*) es una app autónoma: tiene su propio shell
  // (sidebar + header móvil) en admin/layout.jsx y ocupa toda la pantalla.
  // No debe llevar el Header ni el Footer globales del sitio público.
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  // HackaItlac tiene su propio diseño full-bleed con navegación personalizada.
  const isHackaitlac = pathname === '/hackaitlac' || pathname.startsWith('/hackaitlac/');
  // La home tiene su propio scroll container y renderiza su Footer internamente.
  const showChrome = !isAdmin && !isHackaitlac;
  const showFooter = showChrome && pathname !== '/';

  return (
    <AuthProvider>
      {showChrome && <Header />}
      <main className={isAdmin ? '' : 'flex-grow'}>{children}</main>
      {showFooter && <Footer />}
      <ToastContainer
        position="top-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        pauseOnHover
        theme="dark"
      />
    </AuthProvider>
  );
}
