"use client";

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-gray-900 border-t border-gray-800">
      <div className="container mx-auto py-12 px-6">
        {/* Top section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Logo and description */}
          <div className="md:col-span-2">
            <Link href="/club" className="flex items-center space-x-2 text-[#1ef184] font-bold text-xl mb-4">
              <span className="text-2xl">&lt;/&gt;</span>
              <span>Crocoders</span>
            </Link>
            <p className="text-gray-400 mb-6 max-w-md">
              Somos una comunidad apasionada por la programación competitiva y otras disciplinas relacionadas al ambito de la programación. Fomentamos el desarrollo de habilidades algorítmicas y pensamiento lógico a través de la práctica y la participación en competencias.
            </p>
            <div className="flex space-x-4">
              {/* Social media icons */}
              {[
                { icon: 'M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z', name: 'Facebook' },
                { icon: 'M16.98 0a6.9 6.9 0 0 1 5.08 1.98A6.94 6.94 0 0 1 24 7.02v9.96c0 2.08-.68 3.87-1.98 5.13A7.14 7.14 0 0 1 16.94 24H7.06a7.06 7.06 0 0 1-5.03-1.89A6.96 6.96 0 0 1 0 16.94V7.02C0 2.8 2.8 0 7.02 0h9.96zm.05 2.23H7.06c-1.45 0-2.7.43-3.53 1.25a4.82 4.82 0 0 0-1.3 3.54v9.92c0 1.5.43 2.7 1.3 3.58a5 5 0 0 0 3.53 1.25h9.88a5 5 0 0 0 3.53-1.25 4.73 4.73 0 0 0 1.4-3.54V7.02a5 5 0 0 0-1.3-3.49 4.82 4.82 0 0 0-3.54-1.3zM12 5.76c3.39 0 6.2 2.8 6.2 6.2a6.2 6.2 0 0 1-12.4 0 6.2 6.2 0 0 1 6.2-6.2zm0 2.22a3.99 3.99 0 0 0-3.97 3.97A3.99 3.99 0 0 0 12 15.92a3.99 3.99 0 0 0 3.97-3.97A3.99 3.99 0 0 0 12 7.98zm6.44-3.77a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z', name: 'Instagram' },
                { icon: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z', name: 'GitHub' }
              ].map((social, index) => (
                <motion.a
                  key={index}
                  href="#"
                  className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-[#1ef184]/20 hover:text-[#1ef184] transition-all duration-300"
                  whileHover={{ y: -3 }}
                  aria-label={social.name}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d={social.icon} />
                  </svg>
                </motion.a>
              ))}
            </div>
          </div>
          
          {/* Links */}
          <div>
            <h3 className="text-white font-bold mb-4 text-lg">Enlaces rápidos</h3>
            <ul className="space-y-2">
              {['Inicio', 'Puntajes', 'Eventos','Iniciar', 'Evidencias'].map((item, index) => (
                <li key={index}>
                  <Link 
                    href={item === 'Inicio' ? '/' : `/${item.toLowerCase()}`} 
                    className="text-gray-400 hover:text-[#1ef184] transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Recursos */}
          <div>
            <h3 className="text-white font-bold mb-4 text-lg">Recursos</h3>
            <ul className="space-y-2">
              {['Tutoriales', 'Ejercicios', 'Material', 'Contacto'].map((item, index) => (
                <li key={index}>
                  <Link href={`/#${item.toLowerCase()}`} className="text-gray-400 hover:text-[#1ef184] transition-colors">
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Newsletter subscription 
        <div className="border-t border-gray-800 pt-8 mb-8">
          <div className="max-w-md mx-auto md:mx-0">
            <h3 className="text-white font-bold mb-4 text-lg">Suscríbete a nuestro newsletter</h3>
            <p className="text-gray-400 mb-4">Recibe noticias, tips y actualizaciones sobre programación competitiva</p>
            <form className="flex">
              <input 
                type="email" 
                placeholder="Tu correo electrónico" 
                className="bg-gray-800 text-white rounded-l-lg px-4 py-2 flex-1 border border-gray-700 focus:outline-none focus:border-[#1ef184]"
                required
              />
              <button 
                type="submit" 
                className="bg-[#1ef184] text-gray-900 font-medium rounded-r-lg px-4 hover:bg-[#15c46e] transition-colors"
              >
                Suscribirse
              </button>
            </form>
          </div>
        </div>
        */}

        {/* Bottom section */}
        <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-500 text-sm mb-4 md:mb-0">
            &copy; {currentYear} Club Crocoders. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;