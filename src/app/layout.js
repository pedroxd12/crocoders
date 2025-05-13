"use client";

import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { AuthProvider } from '@/context/AuthContext';

const inter = Inter({ subsets: ['latin'] });


export default function RootLayout({ children }) {
  return (
    <html lang="es" className="scroll-smooth">
      <body className={`${inter.className} bg-gray-900 min-h-screen flex flex-col`}>
        <AuthProvider>
          <Header />
          <link rel="icon" href="/img/logo.png" />
          <main className="flex-grow pt-20">  {/* Añade pt-20 (o el valor que coincida con la altura de tu header) */}
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}