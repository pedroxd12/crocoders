'use client';

import { motion } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';

const ParticleBackground = () => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 20 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 md:w-2 md:h-2 bg-[#1ef184]/20 rounded-full"
          initial={{
            x: `${Math.random() * 100}%`,
            y: `${Math.random() * 100}%`,
            opacity: 0.1 + Math.random() * 0.3
          }}
          animate={{
            x: `${Math.random() * 100}%`,
            y: `${Math.random() * 100}%`,
            opacity: [0.1 + Math.random() * 0.3, 0.8, 0.1 + Math.random() * 0.3]
          }}
          transition={{
            duration: 10 + Math.random() * 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
};

const ContactCard = ({ icon, title, value, link, colorClass }) => {
  return (
    <motion.a
      href={link}
      className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 p-4 md:p-6 rounded-xl shadow-xl border border-gray-700 hover:border-[#1ef184]/50 backdrop-blur-sm flex items-center gap-4"
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
    >
      <div className={`p-3 rounded-lg ${colorClass}`}>
        {icon}
      </div>
      <div>
        <h3 className="text-gray-400 text-sm">{title}</h3>
        <p className="text-white font-medium">{value}</p>
      </div>
    </motion.a>
  );
};

const ContactForm = () => {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  
  const handleChange = (e) => {
    setFormState({
      ...formState,
      [e.target.name]: e.target.value
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formState),
      });

      const data = await response.json();

      if (data.success) {
        setSubmitStatus('success');
        setFormState({
          name: '',
          email: '',
          subject: '',
          message: ''
        });
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
      
      setTimeout(() => {
        setSubmitStatus(null);
      }, 5000);
    }
  };
  
  return (
    <motion.form 
      onSubmit={handleSubmit}
      className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 p-6 md:p-8 rounded-2xl shadow-xl border border-gray-700 backdrop-blur-sm"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      viewport={{ once: true }}
    >
      <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
        <div>
          <label className="block text-gray-300 mb-2 text-sm">Tu nombre</label>
          <input
            type="text"
            name="name"
            value={formState.name}
            onChange={handleChange}
            className="w-full bg-gray-900/80 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1ef184]/50 focus:border-transparent transition-all"
            placeholder="Nombre completo"
            required
          />
        </div>
        <div>
          <label className="block text-gray-300 mb-2 text-sm">Tu email</label>
          <input
            type="email"
            name="email"
            value={formState.email}
            onChange={handleChange}
            className="w-full bg-gray-900/80 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1ef184]/50 focus:border-transparent transition-all"
            placeholder="correo@ejemplo.com"
            required
          />
        </div>
      </div>
      
      <div className="mb-4 md:mb-6">
        <label className="block text-gray-300 mb-2 text-sm">Asunto</label>
        <input
          type="text"
          name="subject"
          value={formState.subject}
          onChange={handleChange}
          className="w-full bg-gray-900/80 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1ef184]/50 focus:border-transparent transition-all"
          placeholder="¿Sobre qué quieres hablar?"
          required
        />
      </div>
      
      <div className="mb-6 md:mb-8">
        <label className="block text-gray-300 mb-2 text-sm">Mensaje</label>
        <textarea
          name="message"
          value={formState.message}
          onChange={handleChange}
          rows="5"
          className="w-full bg-gray-900/80 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1ef184]/50 focus:border-transparent transition-all"
          placeholder="Escribe tu mensaje aquí..."
          required
        ></textarea>
      </div>
      
      <div className="flex justify-center">
        <motion.button
          type="submit"
          className="bg-gradient-to-r from-[#1ef184] to-[#15c46e] hover:from-[#15c46e] hover:to-[#1ef184] text-gray-900 font-bold py-3 px-8 rounded-full text-base shadow-lg shadow-[#1ef184]/20 transition-all duration-300 transform hover:-translate-y-1 w-full md:w-auto"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mr-2"></div>
              Enviando...
            </div>
          ) : (
            "Enviar mensaje"
          )}
        </motion.button>
      </div>
      
      {submitStatus === 'success' && (
        <motion.div 
          className="mt-4 p-3 bg-[#1ef184]/20 text-[#1ef184] rounded-lg flex items-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
          </svg>
          ¡Mensaje enviado con éxito! Te responderemos pronto.
        </motion.div>
      )}
      
      {submitStatus === 'error' && (
        <motion.div 
          className="mt-4 p-3 bg-red-500/20 text-red-500 rounded-lg flex items-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path>
          </svg>
          Hubo un error al enviar el mensaje. Por favor, inténtalo de nuevo más tarde.
        </motion.div>
      )}
    </motion.form>
  );
};

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState(null);
  
  const faqs = [
    {
      question: "¿Cómo puedo unirme al club Crocoders o al capitulo estudiantil?",
      answer: "Puedes unirte asistiendo a cualquiera de nuestras sesiones o contacta con nosotros para explicarte el procedimiento de cualquier comunidad."
    },
    {
      question: "¿Necesito tener experiencia en programación?",
      answer: "No es necesario tener experiencia previa, pero se recomienda tener al menos conocimientos básicos de programación. Contamos con miembros de todos los niveles que te ayudarán en tu aprendizaje."
    },
    {
      question: "¿Qué lenguajes de programación utilizan?",
      answer: "Principalmente utilizamos C++, Python y Java para programación competitiva."
    }
  ];

  return (
    <div className="space-y-4">
      {faqs.map((faq, index) => (
        <motion.div 
          key={index}
          className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 rounded-xl overflow-hidden border border-gray-700 shadow-md"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: index * 0.1 }}
          viewport={{ once: true }}
        >
          <button
            className="w-full p-4 md:p-5 flex justify-between items-center text-left"
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
          >
            <h3 className="font-medium text-white">{faq.question}</h3>
            <div className={`text-[#1ef184] transition-transform duration-300 ${openIndex === index ? 'rotate-180' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          </button>
          
          <motion.div 
            className="overflow-hidden"
            initial={false}
            animate={{ 
              height: openIndex === index ? "auto" : 0,
              opacity: openIndex === index ? 1 : 0
            }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-4 pt-0 md:p-5 md:pt-0 text-gray-300 border-t border-gray-700">
              {faq.answer}
            </div>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
};

const SocialIcon = ({ platform }) => {
  const platforms = {
    instagram: {
      bg: "bg-gradient-to-br from-purple-600 to-pink-500",
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
        </svg>
      )
    },
    facebook: {
      bg: "bg-blue-600",
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
        </svg>
      )
    },
    github: {
      bg: "bg-gray-700",
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
        </svg>
      )
    },
    discord: {
      bg: "bg-indigo-600",
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
      )
    }
  };

  const platformData = platforms[platform.toLowerCase()] || {
    bg: "bg-gray-600",
    icon: null
  };

  return (
    <motion.a
      href="#"
      className={`w-12 h-12 md:w-14 md:h-14 ${platformData.bg} rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-transform duration-300 hover:-translate-y-1`}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="sr-only">{platform}</span>
      {platformData.icon}
    </motion.a>
  );
};

export default function ContactPage() {
  const fadeInUp = {
    initial: { y: 40, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.6 }
  };

  return (
    <>
      {/* Hero Section */}
      <motion.section 
        className="relative h-[50vh] md:h-[60vh] flex flex-col justify-center items-center text-center px-4 bg-gray-900"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <ParticleBackground />
        
        <div className="relative z-20 max-w-4xl">
          <motion.div 
            className="mb-4 md:mb-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="inline-block bg-gradient-to-br from-[#1ef184]/20 to-purple-500/20 p-3 rounded-full backdrop-blur-sm border border-[#1ef184]/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 md:h-10 md:w-10 text-[#1ef184]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </motion.div>
          
          <motion.h1 
            className="text-4xl md:text-6xl font-extrabold mb-4 md:mb-6 text-white"
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#1ef184] to-[#15c46e]">Contáctanos</span>
          </motion.h1>
          
          <motion.p
            className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            Estamos aquí para responder tus dudas y ayudarte a formar parte de nuestra comunidad de programadores
          </motion.p>
        </div>
      </motion.section>

      {/* Main Content */}
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16 -mt-20 md:-mt-24 relative z-20">
        {/* Contact Info Cards */}
        <motion.div 
          className="grid md:grid-cols-2 gap-4 md:gap-6 mb-12 md:mb-16"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <ContactCard 
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            title="Email"
            value="club.crocoders@gmail.com"
            link="mailto:club.crocoders@gmail.com"
            colorClass="bg-[#1ef184]/20 text-[#1ef184]"
          />
        
        </motion.div>
        
        {/* Contact Form and FAQ Section */}
        <div className="grid md:grid-cols-5 gap-8 md:gap-12">
          {/* Contact Form */}
          <div className="md:col-span-3">
            <div className="mb-8">
              <motion.div 
                className="inline-block mb-3 px-3 py-1 rounded-full bg-[#1ef184]/10 text-[#1ef184] text-xs md:text-sm font-medium"
                {...fadeInUp}
              >
                ESCRÍBENOS
              </motion.div>
              <motion.h2 
                className="text-2xl md:text-4xl font-bold mb-4 text-white"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: true }}
              >
                Formulario de <span className="text-[#1ef184]">contacto</span>
              </motion.h2>
              <motion.p 
                className="text-base text-gray-400"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                viewport={{ once: true }}
              >
                Completa el formulario y nos pondremos en contacto contigo lo antes posible
              </motion.p>
            </div>
            
            <ContactForm />
          </div>
          
          {/* FAQ Section */}
          <div className="md:col-span-2">
            <div className="mb-8">
              <motion.div 
                className="inline-block mb-3 px-3 py-1 rounded-full bg-[#1ef184]/10 text-[#1ef184] text-xs md:text-sm font-medium"
                {...fadeInUp}
              >
                PREGUNTAS FRECUENTES
              </motion.div>
              <motion.h2 
                className="text-2xl md:text-4xl font-bold mb-4 text-white"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: true }}
              >
                <span className="text-[#1ef184]">FAQ</span>
              </motion.h2>
              <motion.p 
                className="text-base text-gray-400"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                viewport={{ once: true }}
              >
                Respuestas a las preguntas más comunes
              </motion.p>
            </div>
            
            <FAQ />
          </div>
        </div>
        
        {/* Social Media Section */}
        <motion.section 
          className="mt-16 md:mt-24 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <motion.h2 
            className="text-2xl md:text-3xl font-bold mb-6 text-white"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            Síguenos en <span className="text-[#1ef184]">redes sociales</span>
          </motion.h2>
          
          <motion.div 
            className="flex justify-center space-x-4 md:space-x-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <SocialIcon platform="Instagram" />
            <SocialIcon platform="Facebook" />
            <SocialIcon platform="GitHub" />
            <SocialIcon platform="Discord" />
          </motion.div>
        </motion.section>
        
        {/* CTA Section */}
        <motion.section 
          className="relative py-16 md:py-20 my-16 md:my-24 rounded-xl md:rounded-2xl overflow-hidden"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#1ef184]/30 to-purple-600/30" />
          <div className="absolute inset-0 backdrop-blur-sm bg-gray-900/70" />
          
          <div className="relative z-10 text-center py-8 md:py-10 px-4 md:px-6">
            <motion.h2 
              className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 text-white"
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
                href="/club/#horario" 
                className="bg-transparent border-2 border-[#1ef184] text-[#1ef184] hover:bg-[#1ef184]/10 font-bold py-2 px-6 md:py-3 md:px-8 rounded-full text-sm md:text-base transition-all duration-300 inline-block transform hover:-translate-y-1"
              >
                Ver horario
              </a>
            </motion.div>
          </div>
        </motion.section>
      </div>
    </>
  );
}