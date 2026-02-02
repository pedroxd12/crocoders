// src/app/contacto/page.js
"use client";

import { motion } from 'framer-motion';
import { useState } from 'react';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import styles from './page.module.css';
import BongoCatKeyboard from '@/components/BongoCatKeyboard';

export default function ContactPage() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // 'success', 'error', null
  
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
        setFormState({ name: '', email: '', subject: '', message: '' });
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        
        <motion.div 
          className={styles.header}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className={styles.title}>
            Contactanos <span className={styles.accent}>Ahora.</span>
          </h1>
          <p className={styles.subtitle}>
            ¿Tienes alguna duda, propuesta o simplemente quieres saludar? 
            Estamos aquí para escucharte y colaborar.
          </p>
        </motion.div>

        <div className={styles.contentGrid}>
          
          {/* Form Column - Moved to Left */}
          <motion.div 
            className={styles.formCol}
            initial={{ opacity: 0, x: -30 }} // Changed animation direction since it's on left now
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <form className={styles.formContainer} onSubmit={handleSubmit}>
              
              {submitStatus === 'success' && (
                <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }}
                    className={styles.successMessage}
                >
                    <CheckCircle size={20} />
                    <span>¡Mensaje enviado con éxito! Te responderemos pronto.</span>
                </motion.div>
              )}

              {submitStatus === 'error' && (
                <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }}
                    className={styles.errorMessage}
                >
                    <AlertCircle size={20} />
                    <span>Hubo un error al enviar el mensaje. Inténtalo de nuevo.</span>
                </motion.div>
              )}

              <div className={styles.formGroup}>
                <label htmlFor="name" className={styles.label}>Nombre completo</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formState.name}
                  onChange={handleChange}
                  required
                  className={styles.input}
                  placeholder="Ej. Juan Pérez"
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="email" className={styles.label}>Correo electrónico</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formState.email}
                  onChange={handleChange}
                  required
                  className={styles.input}
                  placeholder="ejemplo@correo.com"
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="subject" className={styles.label}>Asunto</label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  value={formState.subject}
                  onChange={handleChange}
                  required
                  className={styles.input}
                  placeholder="¿Sobre qué quieres hablar?"
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="message" className={styles.label}>Mensaje</label>
                <textarea
                  id="message"
                  name="message"
                  value={formState.message}
                  onChange={handleChange}
                  required
                  className={styles.textarea}
                  placeholder="Escribe tu mensaje aquí..."
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className={styles.submitButton}
              >
                {isSubmitting ? 'Enviando...' : (
                    <>
                        Enviar Mensaje <Send size={18} />
                    </>
                )}
              </button>
            </form>
          </motion.div>

          {/* Spline Animation Column - Right */}
          <motion.div 
            className={styles.infoCol}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            style={{ width: '100%', height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
          >
             <BongoCatKeyboard />
          </motion.div>

        </div>
      </div>
    </div>
  );
}