"use client";
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, useMemo } from 'react';

export default function Home() {
  const [isVisible, setIsVisible] = useState(false);
  const [textIndex, setTextIndex] = useState(0);
  
  // Phrases stored in useMemo for reference stability
  const phrases = useMemo(() => [
    "Entra en el mundo de la programación competitiva...",
    "Relacionate con estudiantes y profesionales en el sector...",
    "Desarrolla habilidades técnicas para tu futuro..."
  ], []);

  // Balloon colors in useMemo for reference stability
  const balloonColors = useMemo(() => [
    'fill-red-500',
    'fill-blue-500',
    'fill-green-500',
    'fill-purple-500',
    'fill-yellow-500',
    'fill-pink-500'
  ], []);

  const [balloons, setBalloons] = useState([]);

  useEffect(() => {
    setIsVisible(true);
    
    const textInterval = setInterval(() => {
      setTextIndex((prevIndex) => (prevIndex + 1) % phrases.length);
    }, 3000);

    setBalloons(Array.from({ length: 12 }).map(() => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 30 + 100}%`,
      width: `${60 + Math.random() * 40}px`,
      height: `${80 + Math.random() * 60}px`,
      delay: `${Math.random() * 5}s`,
      duration: `${15 + Math.random() * 10}s`,
      color: balloonColors[Math.floor(Math.random() * balloonColors.length)],
      rotation: `${Math.random() * 30 - 15}deg`,
      scale: `${0.8 + Math.random() * 0.4}`,
      strokeColor: 'stroke-black'
    })));
    
    return () => {
      clearInterval(textInterval);
    };
  }, [balloonColors, phrases.length]); 

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden">
    {/* Background image with improved responsive handling */}
    <div className="absolute inset-0 z-0">
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 to-[#84f5f3]/10 z-10"></div>
      <div className="relative w-full h-full">
        <Image
          src="/img/principal.png"
          alt="Fondo"
          fill
          sizes="100vw"
          className="object-cover"
          quality={90}
          priority
        />
      </div>
    </div>
      
      {/* Globos animados 
      
      
      <div className="absolute inset-0 z-1 overflow-hidden">
        {balloons.map((balloon, i) => (
          <div 
            key={`balloon-${i}`}
            className="absolute animate-balloon-float"
            style={{
              left: balloon.left,
              top: balloon.top,
              width: balloon.width,
              height: balloon.height,
              animationDelay: balloon.delay,
              animationDuration: balloon.duration,
              transform: `rotate(${balloon.rotation}) scale(${balloon.scale})`,
              filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))'
            }}
          >
            <svg 
              viewBox="0 0 200 400" 
              preserveAspectRatio="xMidYMid meet"
              className={`w-full h-full ${balloon.color} ${balloon.strokeColor}`}
              strokeWidth="2"
            >
            
              <ellipse cx="100" cy="100" rx="50" ry="70" />
              
            
              <path 
                d="M100 170 
                   C 90 200, 110 230, 100 260
                   C 90 290, 110 320, 100 350" 
                fill="none" 
                stroke="white"
                strokeWidth="2"
              />

           
              <line x1="95" y1="165" x2="105" y2="175" stroke="white" strokeWidth="2" />
              <line x1="105" y1="165" x2="95" y2="175" stroke="white" strokeWidth="2" />
            </svg>
          </div>
        ))}
      </div>
      *
      */}

       {/* Content section with better spacing for mobile */}
       <div className={`relative z-10 px-4 sm:px-6 md:px-8 py-6 md:py-8 text-center text-white w-full max-w-3xl mx-auto transition-all duration-1000 transform ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}> 
        <h1 className="text-4xl xs:text-5xl sm:text-6xl font-bold mb-4 sm:mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-teal-400 animate-gradient-x">
          Bienvenid@
        </h1>
        
        <div className="h-16 flex items-center justify-center">
          <p className={`text-lg sm:text-xl md:text-2xl font-light transition-all duration-700 animate-fadeIn ${textIndex === 0 ? 'text-blue-300' : textIndex === 1 ? 'text-purple-300' : 'text-teal-300'}`}>
            {phrases[textIndex]}
          </p>
        </div>
        
        <p className="text-base sm:text-lg mt-6 sm:mt-10 mb-6 sm:mb-10 leading-relaxed max-w-2xl mx-auto backdrop-blur-sm bg-black/10 p-4 sm:p-6 rounded-xl shadow-lg">
          Únete a nuestro capítulo de <span className="font-semibold text-[#f6922c] hover:text-[#ff9f40] transition-colors duration-300">Computer Society</span> o al club <span className="font-semibold text-green-400 hover:text-green-300 transition-colors duration-300">Crocoders</span> y desarrolla tus habilidades en un ambiente colaborativo y desafiante.
        </p>
        
        <div className="flex flex-col md:flex-row gap-4 justify-center mt-8 sm:mt-12">
          <Link href="/club">
            <button className="group relative bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-purple-600 text-white px-6 sm:px-10 py-3 sm:py-4 rounded-lg text-lg sm:text-xl transition-all duration-300 ease-out shadow-lg hover:shadow-xl shadow-blue-500/20 hover:shadow-purple-500/30 flex items-center justify-center overflow-hidden w-full md:w-auto">
              <span className="relative z-10 transition-transform duration-300 ease-in-out group-hover:translate-x-1">Explorar</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 relative z-10 transition-all duration-300 ease-in-out group-hover:translate-x-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <div className="absolute inset-0 w-3/4 h-full bg-white/10 skew-x-12 -translate-x-full group-hover:translate-x-full duration-700 ease-in-out transition-transform"></div>
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}