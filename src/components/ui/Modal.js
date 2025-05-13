// Asegúrate de que la ruta de importación sea correcta para tu proyecto
// Ejemplo: src/components/ui/Modal.jsx
'use client'; // Si es un Client Component en Next.js App Router

import { useEffect } from 'react';
import { X } from 'lucide-react'; // O tu icono de cierre preferido

export default function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'lg',      // Tamaños: 'fit', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'
  className = '',   // Clases personalizadas para el panel del modal
  hideHeader = false, // Para ocultar la cabecera (título y botón de cierre)
  bodyClassName = '', // Clases personalizadas para el área del contenido (children)
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    // Limpia el estilo cuando el componente se desmonta o isOpen cambia
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    fit: 'w-auto max-w-[90vw] sm:max-w-md', // Se ajusta al contenido, con un máximo
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl', // Tamaño original que tenías
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl',
    '3xl': 'max-w-7xl',
    'full': 'w-full h-full', // Ocupa todo el espacio disponible en el backdrop
  };

  // Clases base para el panel del modal
  const modalPanelBaseClasses = "bg-gray-800 shadow-xl w-full flex flex-col";
  
  // Clases para la forma y altura por defecto, se modifican si size es 'full'
  const defaultShapeClasses = size === 'full' 
    ? 'h-full max-h-full rounded-none' // Sin bordes redondeados y altura completa para 'full'
    : 'rounded-lg max-h-[90vh]';      // Bordes redondeados y altura máxima para otros tamaños
  
  const currentSizeClass = sizeClasses[size] || sizeClasses.lg;

  // Clases para el padding del cuerpo, dependen de si la cabecera está oculta
  const defaultBodyPadding = hideHeader ? 'p-0' : 'p-4 md:p-6';

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 transition-opacity duration-150 ease-in-out animate-fadeIn"
      // Descomenta la siguiente línea si quieres que el clic en el fondo cierre el modal:
      // onClick={onClose} 
    >
      <div
        className={`${modalPanelBaseClasses} ${defaultShapeClasses} ${currentSizeClass} ${className}`}
        onClick={(e) => e.stopPropagation()} // Evita que el clic en el contenido del modal cierre el modal (si el clic en el fondo está activado)
      >
        {/* Cabecera del Modal (opcional) */}
        {!hideHeader && (
          <div className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
            <h3 className="text-xl font-semibold text-white truncate pr-2">
              {title || ''} {/* Muestra el título o nada si no hay título */}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors rounded-full p-1 hover:bg-gray-700 flex-shrink-0"
              aria-label="Cerrar modal"
            >
              <X size={24} />
            </button>
          </div>
        )}

        {/* Cuerpo del Modal (Contenido) */}
        <div className={`flex-grow overflow-y-auto ${defaultBodyPadding} ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Opcional: Si usas la clase `animate-fadeIn`, añade estas keyframes a tu CSS global:
/*
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.animate-fadeIn {
  animation: fadeIn 0.15s ease-in-out;
}
*/