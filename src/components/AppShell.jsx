'use client';

import { usePathname } from 'next/navigation';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { AuthProvider } from '@/context/AuthContext';

export default function AppShell({ children }) {
  const pathname = usePathname();
  // La home tiene su propio scroll container y renderiza su Footer internamente.
  const showFooter = pathname !== '/';

  return (
    <AuthProvider>
      <Header />
      <main className="flex-grow">{children}</main>
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
