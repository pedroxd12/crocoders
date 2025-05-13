"use client";

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

const Header = () => {
  const [scrollY, setScrollY] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav 
      className={`fixed top-0 left-0 right-0 z-50 py-4 px-6 transition-all duration-300 ${scrollY > 100 ? 'bg-gray-900/90 backdrop-blur-md shadow-lg shadow-black/20' : 'bg-transparent'}`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ delay: 0.5, type: "spring" }}
    >
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/club" className="flex items-center space-x-2 text-[#1ef184] font-bold text-lg">
          <span className="text-xl">&lt;/&gt;</span>
          <span>Crocoders</span>
        </Link>
        <Link href="/capitulo" className="flex items-center space-x-2 text-[#f6922c] font-bold text-lg">
          <span className="text-xl">&lt;/&gt;</span>
          <span>Computer Society</span>
        </Link>
        
        {/* Desktop menu */}
        <div className="hidden md:flex space-x-6">
          <Link href="/eventos" className="text-gray-300 hover:text-[#1ef184] transition-colors">Eventos</Link>
          <Link href="/puntajes" className="text-gray-300 hover:text-[#1ef184] transition-colors">Puntajes</Link>
          <Link href="/club/#horarios" className="text-gray-300 hover:text-[#1ef184] transition-colors">Horarios</Link>
          <Link href="/evidencias" className="text-gray-300 hover:text-[#1ef184] transition-colors">Evidencias</Link>
          <Link href="/" className="text-gray-300 hover:text-[#1ef184] transition-colors">Inicio</Link>
        </div>
        
        {/* Mobile menu button */}
        <div className="md:hidden">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="text-gray-300 focus:outline-none"
          >
            {isMenuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
        
        <Link 
          href="/iniciar" 
          className="hidden md:block bg-[#1ef184]/10 hover:bg-[#1ef184]/20 text-[#1ef184] py-2 px-4 rounded-full border border-[#1ef184]/50 text-sm transition-all duration-300"
        >
          Iniciar ahora
        </Link>
      </div>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <motion.div 
          className="md:hidden absolute top-full left-0 right-0 bg-gray-900/95 backdrop-blur-lg shadow-xl z-50 border-t border-gray-800"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="container mx-auto text-center py-4 px-6 flex flex-col space-y-4">
            <Link 
              href="/eventos" 
              className="text-gray-300 hover:text-[#1ef184] transition-colors py-2 border-b border-gray-800"
              onClick={() => setIsMenuOpen(false)}
            >
              Eventos
            </Link>
            <Link 
              href="/puntajes" 
              className="text-gray-300 hover:text-[#1ef184] transition-colors py-2 border-b border-gray-800"
              onClick={() => setIsMenuOpen(false)}
            >
              Puntajes
            </Link>
            <Link 
              href="/club/#horarios" 
              className="text-gray-300 hover:text-[#1ef184] transition-colors py-2 border-b border-gray-800"
              onClick={() => setIsMenuOpen(false)}
            >
              Horarios
            </Link>
            <Link 
              href="/evidencias" 
              className="text-gray-300 hover:text-[#1ef184] transition-colors py-2 border-b border-gray-800"
              onClick={() => setIsMenuOpen(false)}
            >
              Evidencias
            </Link>
            <Link 
              href="/iniciar" 
              className="bg-[#1ef184]/10 hover:bg-[#1ef184]/20 text-[#1ef184] py-2 px-4 rounded-full border border-[#1ef184]/50 text-sm transition-all duration-300 text-center"
              onClick={() => setIsMenuOpen(false)}
            >
              Iniciar ahora
            </Link>
            <Link 
              href="/" 
              className="bg-[#B31B1B]/10 hover:bg-[#f6922c]/20 text-[#B31B1B] py-2 px-4 rounded-full border border-[#B31B1B]/50 text-sm transition-all duration-300 text-center"
              onClick={() => setIsMenuOpen(false)}
            >
             Inicio
            </Link>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
};

export default Header;