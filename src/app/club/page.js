"use client";

import Image from 'next/image';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import CountUp from 'react-countup';

const ParticleBackground = () => {
  const [particles, setParticles] = useState([]);
  
  useEffect(() => {
    setParticles(
      Array.from({ length: 20 }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        opacity: 0.1 + Math.random() * 0.3,
        targetX: Math.random() * 100,
        targetY: Math.random() * 100,
        targetOpacity: 0.1 + Math.random() * 0.3,
        duration: 10 + Math.random() * 20
      }))
    );
  }, []);

  if (particles.length === 0) {
    return null; 
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 md:w-2 md:h-2 bg-[#1ef184]/20 rounded-full"
          initial={{
            x: `${particle.x}%`,
            y: `${particle.y}%`,
            opacity: particle.opacity
          }}
          animate={{
            x: `${particle.targetX}%`,
            y: `${particle.targetY}%`,
            opacity: [particle.opacity, 0.8, particle.targetOpacity]
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
};

// Componente de Estadísticas Dinámicas
const StatsSection = () => {
  const [stats, setStats] = useState({
    miembros: 0,
    problemas: 0,
    eventos: 0,
    años: 1
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/estadisticas');
        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error('Error fetching stats:', error);
        // Valores por defecto en caso de error
        setStats({
          miembros: 50,
          problemas: 100,
          eventos: 30,
          años: 1
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="relative mb-20 md:mb-32 py-12 md:py-16 rounded-2xl md:rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#1ef184]/20 to-purple-500/20" />
        <div className="absolute inset-0 backdrop-blur-sm bg-gray-900/60" />
        <div className="relative z-10 container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 text-center">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-3 md:p-4">
                <div className="h-10 md:h-12 bg-gray-700 rounded animate-pulse mb-2 mx-auto w-3/4"></div>
                <div className="h-4 bg-gray-700 rounded animate-pulse mx-auto w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.section
      className="relative mb-20 md:mb-32 py-12 md:py-16 rounded-2xl md:rounded-3xl overflow-hidden"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[#1ef184]/20 to-purple-500/20" />
      <div className="absolute inset-0 backdrop-blur-sm bg-gray-900/60" />
      
      <div className="relative z-10 container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 text-center">
          <motion.div
            className="p-3 md:p-4"
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            viewport={{ once: true }}
          >
            <div className="text-3xl md:text-4xl font-bold text-white mb-1 md:mb-2">
              <CountUp end={stats.miembros} duration={2} />+
            </div>
            <div className="text-[#1ef184] text-sm md:text-base font-medium">Miembros</div>
          </motion.div>
          
          <motion.div
            className="p-3 md:p-4"
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className="text-3xl md:text-4xl font-bold text-white mb-1 md:mb-2">
              <CountUp end={stats.problemas} duration={2} />+
            </div>
            <div className="text-[#1ef184] text-sm md:text-base font-medium">Problemas</div>
          </motion.div>
          
          <motion.div
            className="p-3 md:p-4"
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            viewport={{ once: true }}
          >
            <div className="text-3xl md:text-4xl font-bold text-white mb-1 md:mb-2">
              <CountUp end={stats.eventos} duration={2} />+
            </div>
            <div className="text-[#1ef184] text-sm md:text-base font-medium">Eventos</div>
          </motion.div>
          
          <motion.div
            className="p-3 md:p-4"
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            viewport={{ once: true }}
          >
            <div className="text-3xl md:text-4xl font-bold text-white mb-1 md:mb-2">
              {stats.años}+
            </div>
            <div className="text-[#1ef184] text-sm md:text-base font-medium">Años</div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
};

// Componente Card para actividades y participaciones
const FeatureCard = ({ image, title, description, features, colorClass }) => {
  return (
    <motion.div
      className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 p-4 md:p-6 rounded-2xl shadow-xl border border-gray-700 hover:border-[#1ef184]/50 backdrop-blur-sm"
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
    >
      <div className="relative h-48 md:h-56 mb-4 rounded-xl overflow-hidden group">
        <Image 
          src={image} 
          alt={title} 
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <motion.div 
          className="absolute bottom-4 left-4 px-3 py-1 bg-gray-900/80 rounded-lg border-l-4 border-[#1ef184]"
          initial={{ x: -20, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className={`text-lg md:text-xl font-bold ${colorClass}`}>{title}</h3>
        </motion.div>
      </div>
      <p className="text-gray-300 mb-3 text-sm md:text-base">
        {description}
      </p>
      <ul className="space-y-1 text-sm md:text-base text-gray-300">
        {features.map((feature, index) => (
          <motion.li 
            key={index} 
            className="flex items-start"
            initial={{ x: -10, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 * index }}
          >
            <span className="text-[#1ef184] mr-2 mt-1 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span> 
            {feature}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
};

export default function ClubPage() {
  const [scrollY, setScrollY] = useState(0);
  
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const fadeInUp = {
    initial: { y: 40, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.6 }
  };

  return (
    <>
      {/* Hero Section */}
      <motion.section 
        className="relative h-[80vh] md:h-screen flex flex-col justify-center items-center text-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-gray-900 z-10" />
        <Image 
          src="/evidencia/playeras.jpg" 
          alt="Club Crocoders" 
          fill
          className="object-cover"
          priority
        />
        
        <ParticleBackground />
        
        <div className="relative z-20 max-w-5xl">
          <motion.div 
            className="mb-4 md:mb-6 flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="h-20 w-20 md:h-32 md:w-32 bg-gradient-to-br from-[#1ef184] to-[#15c46e] rounded-full flex items-center justify-center shadow-lg shadow-[#1ef184]/20">
              <span className="text-3xl md:text-5xl font-bold text-gray-900">&lt;/&gt;</span>
            </div>
          </motion.div>
          
          <motion.h1 
            className="text-4xl md:text-6xl font-extrabold mb-4 md:mb-6 text-white"
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            Club <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#1ef184] to-[#15c46e]">Crocoders</span>
          </motion.h1>
          
          <motion.div
            className="relative mb-6 md:mb-8 w-full max-w-md mx-auto overflow-hidden"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 1, delay: 0.5 }}
          >
            <p className="text-lg md:text-xl text-gray-300 py-2 px-4 bg-gray-800/50 rounded-full backdrop-blur-sm border border-gray-700">
              Club de programación competitiva
            </p>
          </motion.div>
          
          <motion.div
            className="flex flex-col sm:flex-row justify-center gap-3 md:gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            <a 
              href="#actividades" 
              className="bg-gradient-to-r from-[#1ef184] to-[#15c46e] hover:from-[#15c46e] hover:to-[#1ef184] text-gray-900 font-bold py-2 px-6 md:py-3 md:px-8 rounded-full text-sm md:text-base shadow-lg shadow-[#1ef184]/20 transition-all duration-300 inline-block transform hover:-translate-y-1"
            >
              Conoce más
            </a>
            <a 
              href="#horarios" 
              className="bg-transparent border-2 border-[#1ef184] text-[#1ef184] hover:bg-[#1ef184]/10 font-bold py-2 px-6 md:py-3 md:px-8 rounded-full text-sm md:text-base transition-all duration-300 inline-block transform hover:-translate-y-1"
            >
              Horarios
            </a>
          </motion.div>
        </div>
      </motion.section>

      {/* Main Content */}
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* Actividades Section */}
        <motion.section 
          id="actividades"
          className="mb-20 md:mb-32 pt-12 md:pt-20"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <div className="text-center mb-12 md:mb-16">
            <motion.div 
              className="inline-block mb-3 px-3 py-1 rounded-full bg-[#1ef184]/10 text-[#1ef184] text-xs md:text-sm font-medium"
              {...fadeInUp}
            >
              LO QUE HACEMOS
            </motion.div>
            <motion.h2 
              className="text-3xl md:text-5xl font-bold mb-4 md:mb-6 text-white"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
            >
              Nuestras <span className="text-[#1ef184]">Actividades</span>
            </motion.h2>
            <motion.p 
              className="text-base md:text-lg text-gray-400 max-w-3xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              viewport={{ once: true }}
            >
              Descubre todo lo que hacemos en el club para mejorar tus habilidades de programación
            </motion.p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            <FeatureCard
              image="/evidencia/sesiones.jpg"
              title="Sesiones de Programación"
              description="Aprende a resolver problemas de comunes de la programación."
              features={[
                "Problemas de Codeforces, vjudge y plataformas especializadas",
                "Entrenamientos semanales",
                "Simulaciones de competencias"
              ]}
              colorClass="text-blue-300"
            />

            <FeatureCard
              image="/evidencia/charlas.jpg"
              title="Talleres y Charlas"
              description="Aprende de expertos y desarrolla tus habilidades técnicas y profesionales."
              features={[
                "Charlas con programadores experimentados del sector",
                "Talleres prácticos de tecnologias modernas",
                "Preparación para entrevistas técnicas"
              ]}
              colorClass="text-orange-300"
            />
          </div>
        </motion.section>

        {/* Sección de estadísticas */}
        <StatsSection />

        {/* Participaciones Section */}
        <motion.section 
          id="participaciones"
          className="mb-20 md:mb-32 pt-12 md:pt-20"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <div className="text-center mb-12 md:mb-16">
            <motion.div 
              className="inline-block mb-3 px-3 py-1 rounded-full bg-[#1ef184]/10 text-[#1ef184] text-xs md:text-sm font-medium"
              {...fadeInUp}
            >
              EVENTOS
            </motion.div>
            <motion.h2 
              className="text-3xl md:text-5xl font-bold mb-4 md:mb-6 text-white"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
            >
              Nuestras <span className="text-[#1ef184]">Participaciones</span>
            </motion.h2>
            <motion.p 
              className="text-base md:text-lg text-gray-400 max-w-3xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              viewport={{ once: true }}
            >
              Participaciones en competencias de renombre en la programación
            </motion.p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            <FeatureCard
              image="/evidencia/competencias.jpg"
              title="Competencias"
              description="Participamos en los eventos más importantes de programación competitiva."
              features={[
                "ICPC y concursos regionales",
                "Competencias regulares en Codeforces y CodeChef",
                "Hackathones con enfoque en soluciones innovadoras"
              ]}
              colorClass="text-purple-300"
            />

            <FeatureCard
              image="/evidencia/convivencia.jpg"
              title="Eventos Sociales"
              description="No todo es programación, también hay momentos de convivencia."
              features={[
                "Convivencias, juegos y actividades recreativas",
                "Eventos de integración",
                "Proyectos colaborativos multidisciplinarios"
              ]}
              colorClass="text-yellow-300"
            />
          </div>
        </motion.section>

        {/* Horarios Section */}
        <motion.section 
          id="horarios"
          className="mb-20 md:mb-32 pt-12 md:pt-20"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true, margin: "-50px" }}
        >
          <div className="text-center mb-12 md:mb-16">
            <motion.div 
              className="inline-block mb-3 px-3 py-1 rounded-full bg-[#1ef184]/10 text-[#1ef184] text-xs md:text-sm font-medium"
              {...fadeInUp}
            >
              CUÁNDO Y DÓNDE
            </motion.div>
            <motion.h2 
              className="text-3xl md:text-5xl font-bold mb-4 md:mb-6 text-white"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <span className="text-[#1ef184]">Horarios</span> de sesiones
            </motion.h2>
            <motion.p 
              className="text-base md:text-lg text-gray-400 max-w-3xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              viewport={{ once: true }}
            >
              Únete a nuestras reuniones semanales en persona y virtuales
            </motion.p>
          </div>

          <motion.div 
            className="max-w-4xl mx-auto bg-gradient-to-br from-gray-800/90 to-gray-900/90 rounded-xl md:rounded-2xl shadow-lg md:shadow-2xl border border-gray-700 backdrop-blur-sm overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <div className="p-4 md:p-6 lg:p-8">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr>
                      <th className="py-2 px-3 md:py-3 md:px-4 text-left text-sm md:text-base font-bold text-[#1ef184] border-b-2 border-gray-700">Día</th>
                      <th className="py-2 px-3 md:py-3 md:px-4 text-left text-sm md:text-base font-bold text-[#1ef184] border-b-2 border-gray-700">Hora</th>
                      <th className="py-2 px-3 md:py-3 md:px-4 text-left text-sm md:text-base font-bold text-[#1ef184] border-b-2 border-gray-700">Ubicación</th>
                      <th className="py-2 px-3 md:py-3 md:px-4 text-left text-sm md:text-base font-bold text-[#1ef184] border-b-2 border-gray-700">Actividad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        day: "Lunes",
                        time: "13:00 - 14:00",
                        location: "Edificio I",
                        activity: "Entrenamiento de algoritmos",
                        color: "text-blue-300"
                      },
                      {
                        day: "Viernes",
                        time: "13:00 - 14:00",
                        location: "Edificio I",
                        activity: "Simulación de competencias",
                        color: "text-purple-300"
                      },
                      {
                        day: "Domingo",
                        time: "16:00 - 18:00",
                        location: "Clase virtual, zoom",
                        activity: "Entrenamiento de algoritmos",
                        color: "text-orange-300"
                      }
                    ].map((session, index) => (
                      <motion.tr 
                        key={index}
                        className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                        initial={{ x: -20, opacity: 0 }}
                        whileInView={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1 * index }}
                        viewport={{ once: true }}
                      >
                        <td className="py-3 px-3 md:py-4 md:px-4 text-sm md:text-base font-medium">{session.day}</td>
                        <td className="py-3 px-3 md:py-4 md:px-4 text-sm md:text-base">{session.time}</td>
                        <td className="py-3 px-3 md:py-4 md:px-4 text-sm md:text-base">{session.location}</td>
                        <td className={`py-3 px-3 md:py-4 md:px-4 text-sm md:text-base ${session.color}`}>
                          <div className="flex items-center">
                            <span className="w-2 h-2 rounded-full bg-current mr-2"></span>
                            {session.activity}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </motion.section>

        {/* CTA Section */}
        <motion.section 
          className="relative py-16 md:py-20 my-12 md:my-16 rounded-xl md:rounded-2xl overflow-hidden"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#1ef184]/30 to-purple-600/30" />
          <div className="absolute inset-0 backdrop-blur-sm bg-gray-900/70" />
          
          <div className="relative z-10 text-center py-8 md:py-10 px-4 md:px-6">
            <motion.h2 
              className="text-3xl md:text-5xl font-bold mb-4 md:mb-6 text-white"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              ¿Listo para ser un <span className="text-[#1ef184]">Crocoder</span>?
            </motion.h2>
            <motion.p 
              className="text-base md:text-lg text-gray-300 mb-6 md:mb-8 max-w-3xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
            >
              Únete a nuestra comunidad de programadores apasionados y lleva tus habilidades al siguiente nivel
            </motion.p>
            
            <motion.div
              className="flex flex-col sm:flex-row justify-center gap-3 md:gap-4"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              viewport={{ once: true }}
            >
              <a 
                href="/iniciar" 
                className="bg-gradient-to-r from-[#1ef184] to-[#15c46e] hover:from-[#15c46e] hover:to-[#1ef184] text-gray-900 font-bold py-2 px-6 md:py-3 md:px-8 rounded-full text-sm md:text-base shadow-lg shadow-[#1ef184]/20 transition-all duration-300 inline-block transform hover:-translate-y-1"
              >
                Únete ahora
              </a>
              <a 
                href="/contacto" 
                className="bg-transparent border-2 border-[#1ef184] text-[#1ef184] hover:bg-[#1ef184]/10 font-bold py-2 px-6 md:py-3 md:px-8 rounded-full text-sm md:text-base transition-all duration-300 inline-block transform hover:-translate-y-1"
              >
                Contactanos
              </a>
            </motion.div>
          </div>
        </motion.section>
      </div>
    </>
  );
}