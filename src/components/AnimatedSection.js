'use client';

import { motion, useReducedMotion } from 'framer-motion';

export default function AnimatedSection({ children, className, delay = 0 }) {
  const prefersReducedMotion = useReducedMotion();

  // Respeta la preferencia del sistema y simplifica la animación: distancia
  // más corta + duración más breve. El gran "y: 50" sobre secciones de
  // pantalla completa provocaba reflows enormes durante el scroll.
  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, ease: 'easeOut', delay }}
      className={className}
      style={{ willChange: 'opacity, transform' }}
    >
      {children}
    </motion.div>
  );
}
