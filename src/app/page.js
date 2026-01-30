"use client";
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, useMemo, useRef } from 'react';

// Icono SVG para el botón de cerrar
const CloseIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
  </svg>
);

export default function Home() {
  const [isVisible, setIsVisible] = useState(false);
  const [textIndex, setTextIndex] = useState(0);
  const [isPhraseAnimatingOut, setIsPhraseAnimatingOut] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  
  const video1Ref = useRef(null);
  const video2Ref = useRef(null);

  // Rutas a los videos en la carpeta /public
  const videos = [
    {
      id: 1,
      url: "/video/braismoure.mp4",
      title: "Estudien ya! Brais Moure"
    },
    {
      id: 2,
      url: "/video/midudev.mp4",
      title: "Un saludo de Midudev"
    }
  ];

  const phrases = useMemo(() => [
    "Entra en el mundo de la programación competitiva...",
    "Relaciónate con estudiantes y profesionales en el sector...",
    "Desarrolla habilidades técnicas para tu futuro..."
  ], []);

  useEffect(() => {
    setIsVisible(true);

    const textInterval = setInterval(() => {
      setIsPhraseAnimatingOut(true);
      setTimeout(() => {
        setTextIndex((prevIndex) => (prevIndex + 1) % phrases.length);
        setIsPhraseAnimatingOut(false);
      }, 700);
    }, 3700);

    // Mostrar el primer video automáticamente después de 2 segundos
    const videoTimer = setTimeout(() => {
      openVideoModal(0);
    }, 2000);

    return () => {
      clearInterval(textInterval);
      clearTimeout(videoTimer);
    };
  }, [phrases]);

  // Función para abrir el modal de video
  const openVideoModal = (index) => {
    setActiveVideoIndex(index);
    setIsVideoModalOpen(true);
  };

  // Función para cerrar el modal de video
  const closeVideoModal = () => {
    // Pausar el video actual
    if (activeVideoIndex === 0 && video1Ref.current) {
      video1Ref.current.pause();
    } else if (activeVideoIndex === 1 && video2Ref.current) {
      video2Ref.current.pause();
    }
    
    setIsVideoModalOpen(false);
    setActiveVideoIndex(null);
  };

  // Manejar el fin de reproducción del video
  const handleVideoEnded = () => {
    // Si hay más videos, reproducir el siguiente
    if (activeVideoIndex < videos.length - 1) {
      setActiveVideoIndex(activeVideoIndex + 1);
    } else {
      // Si era el último video, cerrar el modal
      closeVideoModal();
    }
  };

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-gray-900 to-black">
      {/* Imagen de fondo sin efecto de luz */}
      <div className="absolute inset-0 z-0">
        <div className="relative w-full h-full">
          <Image
            src="/img/principal.png"
            alt="Fondo de la página de inicio"
            fill
            sizes="100vw"
            className="object-cover opacity-30"
            quality={90}
            priority
          />
        </div>
      </div>

      {/* Sección de contenido principal */}
      <div className={`relative z-20 px-4 sm:px-6 md:px-8 py-6 md:py-8 text-center text-white w-full max-w-4xl mx-auto transition-all duration-1000 transform ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
        <h1 className="text-5xl xs:text-6xl sm:text-7xl font-bold mb-6 sm:mb-10 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-teal-500 animate-gradient-x">
          Bienvenid@
        </h1>

        <div className="h-16 flex items-center justify-center mb-6 sm:mb-8">
          <p className={`text-xl sm:text-2xl md:text-3xl font-light transition-opacity duration-700 ease-in-out ${isPhraseAnimatingOut ? 'opacity-0' : 'opacity-100'} ${textIndex === 0 ? 'text-blue-300' : textIndex === 1 ? 'text-purple-300' : 'text-teal-300'}`}>
            {phrases[textIndex]}
          </p>
        </div>

        <p className="text-lg sm:text-xl mt-8 sm:mt-10 mb-8 sm:mb-12 leading-relaxed max-w-2xl mx-auto backdrop-blur-sm bg-black/40 p-6 sm:p-8 rounded-2xl shadow-2xl">
          Únete a nuestro capítulo de <span className="font-semibold text-[#f6922c] hover:text-[#ff9f40] transition-colors duration-300">Computer Society</span> o al club <span className="font-semibold text-green-400 hover:text-green-300 transition-colors duration-300">Crocoders</span> y desarrolla tus habilidades en un ambiente colaborativo y desafiante.
        </p>

        <div className="flex flex-col md:flex-row gap-6 justify-center mt-10 sm:mt-14">
          <Link href="/club" legacyBehavior>
            <a className="group relative bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-purple-600 text-white px-8 sm:px-12 py-4 sm:py-5 rounded-xl text-lg sm:text-xl font-medium transition-all duration-300 ease-out shadow-lg hover:shadow-xl shadow-blue-500/20 hover:shadow-purple-500/30 flex items-center justify-center overflow-hidden w-full md:w-auto">
              <span className="relative z-10 transition-transform duration-300 ease-in-out group-hover:translate-x-1">Explorar</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 relative z-10 transition-all duration-300 ease-in-out group-hover:translate-x-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <div className="absolute inset-0 w-full h-full bg-white/10 skew-x-12 -translate-x-full group-hover:translate-x-0 duration-500 ease-in-out transition-transform"></div>
            </a>
          </Link>
          
          <button 
            onClick={() => openVideoModal(0)}
            className="group relative bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-8 sm:px-12 py-4 sm:py-5 rounded-xl text-lg sm:text-xl font-medium transition-all duration-300 ease-out shadow-lg hover:shadow-xl shadow-purple-500/20 hover:shadow-pink-500/30 flex items-center justify-center overflow-hidden w-full md:w-auto"
          >
            <span className="relative z-10">Ver Videos</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 relative z-10" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            <div className="absolute inset-0 w-full h-full bg-white/10 skew-x-12 -translate-x-full group-hover:translate-x-0 duration-500 ease-in-out transition-transform"></div>
          </button>
        </div>
      </div>

      {/* Modal de Video a Pantalla Completa */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          <div className="relative w-full h-full max-w-6xl max-h-screen p-4 md:p-6">
            {/* Título del video */}
            <h2 className="text-white text-xl md:text-2xl font-bold mb-4 text-center">
              {videos[activeVideoIndex].title}
            </h2>
            
            {/* Contenedor del video */}
            <div className="relative w-full h-[calc(100%-6rem)] flex items-center justify-center">
              {/* Video 1 */}
              {activeVideoIndex === 0 && (
                <video
                  ref={video1Ref}
                  src={videos[0].url}
                  className="w-full h-full max-h-[80vh] object-contain rounded-lg"
                  controls
                  autoPlay
                  playsInline
                  onEnded={handleVideoEnded}
                >
                  Tu navegador no soporta la etiqueta de video.
                </video>
              )}
              
              {/* Video 2 */}
              {activeVideoIndex === 1 && (
                <video
                  ref={video2Ref}
                  src={videos[1].url}
                  className="w-full h-full max-h-[80vh] object-contain rounded-lg"
                  controls
                  autoPlay
                  playsInline
                  onEnded={handleVideoEnded}
                >
                  Tu navegador no soporta la etiqueta de video.
                </video>
              )}
            </div>
            
            {/* Botón para cerrar el modal */}
            <button 
              onClick={closeVideoModal}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors duration-300"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}