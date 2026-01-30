"use client";

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

const Header = () => {
  const [scrollY, setScrollY] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeHover, setActiveHover] = useState(null);
  
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const menuItems = [
    { name: "Inicio", href: "/", color: "#f6922c", icon: "🏠" },
    { name: "Eventos", href: "/eventos", color: "#1ef184", icon: "🎯" },
    { name: "Puntajes", href: "/puntajes", color: "#1ef184", icon: "🏆" },
    { name: "Horarios", href: "/club/#horarios", color: "#1ef184", icon: "🕒" },
    { name: "Evidencias", href: "/evidencias", color: "#1ef184", icon: "📊" },
  ];

  return (
    <motion.nav 
      className={`fixed top-0 left-0 right-0 z-50 py-4 px-6 transition-all duration-500 ${
        scrollY > 50 
          ? 'bg-gray-900/90 backdrop-blur-md shadow-lg shadow-black/20' 
          : 'bg-transparent'
      }`}
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2, type: "spring", stiffness: 120 }}
    >
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex space-x-6 items-center">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link href="/club" className="flex items-center space-x-2 text-[#1ef184] font-bold text-lg">
              <motion.span 
                className="text-xl"
                initial={{ rotate: 0 }}
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.5 }}
              >
                &lt;/&gt;
              </motion.span>
              <span>Crocoders</span>
            </Link>
          </motion.div>
          
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link href="/capitulo" className="flex items-center space-x-2 text-[#f6922c] font-bold text-lg">
              <motion.span 
                className="text-xl"
                initial={{ rotate: 0 }}
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.5 }}
              >
                &lt;/&gt;
              </motion.span>
              <span>Computer Society</span>
            </Link>
          </motion.div>
        </div>
        
        {/* Desktop menu */}
        <div className="hidden md:flex space-x-1">
          {menuItems.map((item, index) => (
            <motion.div
              key={index}
              onHoverStart={() => setActiveHover(index)}
              onHoverEnd={() => setActiveHover(null)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative"
            >
              <Link 
                href={item.href} 
                className={`px-4 py-2 rounded-full text-gray-300 hover:text-${item.color === "#1ef184" ? "[#1ef184]" : "[#f6922c]"} transition-colors flex items-center space-x-1 relative z-10`}
              >
                <span className="text-sm hidden lg:inline">{item.icon}</span>
                <span>{item.name}</span>
              </Link>
              {activeHover === index && (
                <motion.div 
                  className="absolute inset-0 rounded-full z-0"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 0.1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  style={{ backgroundColor: item.color }}
                />
              )}
            </motion.div>
          ))}
          
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link 
              href="/iniciar" 
              className="bg-gradient-to-r from-[#1ef184]/30 to-[#1ef184]/10 hover:from-[#1ef184]/40 hover:to-[#1ef184]/20 text-[#1ef184] py-2 px-6 rounded-full border border-[#1ef184]/50 text-sm transition-all duration-300 flex items-center space-x-2"
            >
              <span>Iniciar ahora</span>
              <motion.span
                initial={{ x: 0 }}
                whileHover={{ x: 3 }}
                transition={{ repeat: Infinity, repeatType: "reverse", duration: 0.6 }}
              >
                →
              </motion.span>
            </Link>
          </motion.div>
        </div>
        
        {/* Mobile menu button */}
        <div className="md:hidden">
          <motion.button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="text-gray-300 focus:outline-none p-2 rounded-full"
            whileHover={{ 
              backgroundColor: "rgba(30, 241, 132, 0.1)", 
              transition: { duration: 0.2 } 
            }}
            whileTap={{ scale: 0.9 }}
          >
            <motion.div
              initial={false}
              animate={isMenuOpen ? "open" : "closed"}
            >
              {isMenuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <motion.path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M6 18L18 6M6 6l12 12"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <motion.path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 6h16M4 12h16M4 18h16"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.3, staggerChildren: 0.1 }}
                  />
                </svg>
              )}
            </motion.div>
          </motion.button>
        </div>
      </div>
      
      {/* Mobile menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            className="md:hidden absolute top-full left-0 right-0 bg-gray-900/95 backdrop-blur-lg shadow-xl z-50 border-t border-gray-800 overflow-hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="container mx-auto py-4 px-6">
              {menuItems.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ x: 5 }}
                >
                  <Link 
                    href={item.href} 
                    className={`flex items-center space-x-3 text-gray-300 hover:text-${item.color === "#1ef184" ? "[#1ef184]" : "[#f6922c]"} py-3 border-b border-gray-800/50 w-full transition-all duration-300`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.name}</span>
                  </Link>
                </motion.div>
              ))}
              
              <div className="grid grid-cols-1 gap-3 mt-4">
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: menuItems.length * 0.05 + 0.1 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Link 
                    href="/iniciar" 
                    className="bg-gradient-to-r from-[#1ef184]/20 to-[#1ef184]/5 hover:from-[#1ef184]/30 hover:to-[#1ef184]/10 text-[#1ef184] py-3 px-4 rounded-lg border border-[#1ef184]/30 text-sm transition-all duration-300 flex items-center justify-center space-x-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <span>Iniciar ahora</span>
                    <motion.span
                      animate={{
                        x: [0, 5, 0],
                        transition: { repeat: Infinity, duration: 1.5 }
                      }}
                    >
                      →
                    </motion.span>
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Header;