"use client";

import { Poppins } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { AuthProvider } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';

const poppins = Poppins({ 
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-poppins'
});


export default function RootLayout({ children }) {
  const pathname = usePathname();
  
  return (
    <html lang="es" className="scroll-smooth">
      <body className={`${poppins.className} bg-gray-900 min-h-screen flex flex-col font-sans`}>
        <AuthProvider>
          <Header />
          <link rel="icon" href="/img/logo.png" />
          <main className="flex-grow">
            {children}
          </main>
          {pathname !== '/' && <Footer />}
        </AuthProvider>
      </body>
    </html>
  );
}