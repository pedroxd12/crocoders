// src/app/eventos/[id]/page.jsx
'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useParams, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-toastify';
import Image from 'next/image';
import { motion } from 'framer-motion';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import LoadingSpinner from '@/components/LoadingSpinner';
import { 
  Calendar, Users, Clock, ArrowLeft, CheckCircle, XCircle, UserPlus, 
  LogIn, AlertTriangle, DollarSign, Loader, Info, Tag 
} from 'lucide-react';

async function sendEventRegistrationEmail(email, name, eventDetails) {
  try {
    const response = await fetch('/api/confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, eventDetails }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Error al enviar correo');
    // No es necesario retornar result si solo se quiere confirmar el envío
  } catch (error) {
    console.error('Error al enviar correo de confirmación:', error);
    // No relanzar para no bloquear el flujo principal
  }
}

function EventoDetalleContent() {
  const { id } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  
  const [evento, setEvento] = useState(null);
  const [loading, setLoading] = useState(true); // For event details
  const [error, setError] = useState(null);
  
  const [isRegistered, setIsRegistered] = useState(false);
  const [registrationCheckLoading, setRegistrationCheckLoading] = useState(true);

  const [showRegistrationTypeModal, setShowRegistrationTypeModal] = useState(false);
  const [showGuestFormModal, setShowGuestFormModal] = useState(false);
  const [showUnregisterModal, setShowUnregisterModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [guestData, setGuestData] = useState({
    nombre_completo: '',
    correo_electronico: '',
    numero_telefono: '',
    semestre: '',
    carrera: ''
  });
  const [formErrors, setFormErrors] = useState({});

  const carreras = [
    'Ingeniería en Sistemas Computacionales', 'Ingeniería en Electronica',
    'Ingeniería Industrial', 'Ingeniería Quimica',
    'Ingeniería en Logistica', 'Ingeniería en Mecatronica', 'Otra'
  ];
  const semestres = Array.from({ length: 14 }, (_, i) => ({ value: (i + 1).toString(), label: `${i + 1}° Semestre` }));

  const fetchEventoDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/eventos/${id}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({error: 'Error al cargar el evento'}));
        throw new Error(errData.error || `Error al cargar el evento (status: ${res.status})`);
      }
      const data = await res.json();
      if (!data || Object.keys(data).length === 0) throw new Error('Evento no encontrado o datos vacíos');
      
      const now = new Date();
      const eventEndDate = new Date(data.fecha);
      if (data.hora_fin) {
        const [hours, minutes] = data.hora_fin.split(':');
        eventEndDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 59, 999);
      } else {
        eventEndDate.setHours(23, 59, 59, 999);
      }
      
      setEvento({
        ...data,
        fecha: new Date(data.fecha).toISOString().split('T')[0],
        isPastEvent: eventEndDate < now,
        tipo_evento_display: data.tipo ? data.tipo.charAt(0).toUpperCase() + data.tipo.slice(1) : 'General' // Para mostrar tipo de evento
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);
  
  const checkUserRegistration = useCallback(async (currentEvento, currentUser) => {
    if (!currentEvento || !currentUser?.id_miembro) {
      setIsRegistered(false);
      setRegistrationCheckLoading(false);
      return;
    }
    setRegistrationCheckLoading(true);
    try {
      const res = await fetch(`/api/eventos/check-register?id=${currentEvento.id_evento}&userId=${currentUser.id_miembro}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({error: 'Error al verificar estado de registro'}));
        throw new Error(errData.error ||'Error al verificar estado de registro');
      }
      const data = await res.json();
      setIsRegistered(data.registered);
    } catch (err) {
      setIsRegistered(false);
    } finally {
      setRegistrationCheckLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchEventoDetails();
    }
  }, [id, fetchEventoDetails]);

  useEffect(() => {
    if (!authLoading && !loading && evento && isAuthenticated && user) {
      checkUserRegistration(evento, user);
    } else if (!isAuthenticated && !authLoading && !loading) {
      setIsRegistered(false);
      setRegistrationCheckLoading(false);
    }
  }, [evento, user, isAuthenticated, authLoading, loading, checkUserRegistration]);

  useEffect(() => {
    const registeredParam = searchParams.get('registered');
    const eventIdParam = searchParams.get('eventId');
    if (registeredParam === 'true' && eventIdParam === id) {
      setIsRegistered(true);
      setRegistrationCheckLoading(false); 
      toast.success('¡Inscripción exitosa!', { theme: "dark" });
      router.replace(`/eventos/${id}`, {scroll: false}); 
    }
  }, [searchParams, router, id]);

  const validateGuestForm = () => {
    const errors = {};
    if (!guestData.nombre_completo.trim()) errors.nombre_completo = 'Nombre es requerido';
    if (!guestData.correo_electronico.trim()) errors.correo_electronico = 'Email es requerido';
    else if (!/\S+@\S+\.\S+/.test(guestData.correo_electronico)) errors.correo_electronico = 'Email no válido';
    if (!guestData.numero_telefono.trim()) errors.numero_telefono = 'Teléfono es requerido';
    else if (!/^[0-9]{10}$/.test(guestData.numero_telefono)) errors.numero_telefono = 'Teléfono debe ser de 10 dígitos';
    if (!guestData.carrera) errors.carrera = 'Carrera es requerida';
    if (!guestData.semestre) errors.semestre = 'Semestre es requerido';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleApiRegistration = async (type) => {
    setActionLoading(true);
    const endpoint = type === 'register' ? '/api/eventos/register' : '/api/eventos/unregister';
    const userIdToUse = (type === 'unregister' || (type === 'register' && isAuthenticated)) ? user?.id_miembro : guestData.id_invitado_temp;
    const userType = isAuthenticated ? 'miembro' : 'invitado';

    if (!userIdToUse && !(type === 'register' && !isAuthenticated)) { 
        toast.error("Error: No se pudo identificar al usuario para esta acción.", {theme: "dark"});
        setActionLoading(false);
        return;
    }
    
    try {
      let requestBody = { eventoId: evento.id_evento, userId: userIdToUse, tipo: userType };
      
      if (type === 'register' && !isAuthenticated) {
        const guestRes = await fetch('/api/invitados', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(guestData),
        });
        const guestResult = await guestRes.json();
        if (!guestRes.ok || !guestResult.id_invitado) {
          throw new Error(guestResult.error || 'Error al procesar datos de invitado');
        }
        requestBody.userId = guestResult.id_invitado;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Error en ${type}`);
      }
      
      setIsRegistered(type === 'register'); 
      if (result.event) {
        setEvento(prev => ({...prev, ...result.event, isPastEvent: prev.isPastEvent, tipo_evento_display: prev.tipo_evento_display})); 
      }
      toast.success(result.message || `${type === 'register' ? 'Inscripción' : 'Cancelación'} exitosa!`, { theme: "dark" });

      if (type === 'register') {
        const emailToSend = isAuthenticated ? user.correo_electronico : guestData.correo_electronico;
        const nameToSend = isAuthenticated ? user.nombre_completo : guestData.nombre_completo;
        if (emailToSend && nameToSend && result.event) {
          sendEventRegistrationEmail(emailToSend, nameToSend, result.event);
        }
      }

      setShowRegistrationTypeModal(false);
      setShowGuestFormModal(false);
      setShowUnregisterModal(false);
      if (type === 'register' && !isAuthenticated) {
        setGuestData({ nombre_completo: '', correo_electronico: '', numero_telefono: '', semestre: '', carrera: '' });
        setFormErrors({});
      }

    } catch (error) {
      toast.error(`Error: ${error.message}`, { theme: "dark" });
      if (!isAuthenticated && type === 'register' && error.message.toLowerCase().includes("miembro")) {
        setFormErrors(prev => ({...prev, correo_electronico: error.message}));
      }
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleParticipateFlow = () => {
    if (isRegistered) {
      setShowUnregisterModal(true);
    } else if (evento.isPastEvent) {
      toast.info('Este evento ya ha finalizado.', { theme: "dark" });
    } else if (evento.cupos !== null && evento.cupos_disponibles <= 0) {
      toast.info('No hay cupos disponibles para este evento.', { theme: "dark" });
    } else if (isAuthenticated) {
      handleApiRegistration('register');
    } else {
      setShowRegistrationTypeModal(true);
    }
  };

  const handleGuestRegistrationSubmit = () => {
    if (!validateGuestForm()) return;
    handleApiRegistration('register');
  };

  const handleGuestInputChange = (e) => {
    const { name, value } = e.target;
    setGuestData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: '' }));
  };

  const formatTime = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 'N/A';
    const parts = timeStr.split(':');
    if (parts.length < 2) return 'N/A';
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return 'N/A';
    
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(minutes);
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  
  if (authLoading || loading) return <LoadingSpinner fullScreen text="Cargando detalle del evento..." />;
  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-900 text-red-400">
      <AlertTriangle size={48} className="mb-4"/> 
      <p className="text-xl text-center">{error}</p>
      <Button onClick={fetchEventoDetails} variant="secondary" className="mt-6">Reintentar</Button>
    </div>
  );
  if (!evento) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-900 text-gray-300">
      <AlertTriangle size={48} className="mb-4"/> 
      <p className="text-xl">Evento no encontrado.</p>
      <Button onClick={() => router.push('/eventos')} variant="secondary" className="mt-6">Volver a Eventos</Button>
    </div>
  );

  const canParticipate = !evento.isPastEvent && (evento.cupos === null || evento.cupos_disponibles > 0);

  return (
    <motion.main 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
      className="min-h-screen bg-gradient-to-b from-gray-900 via-slate-900 to-gray-900 text-white py-10 md:py-16 px-4"
    >
      <div className="max-w-5xl mx-auto">
        <motion.button 
          onClick={() => router.push('/eventos')}
          className="flex items-center text-green-400 hover:text-green-300 mb-8 md:mb-10 group text-sm"
          whileHover={{ x: -3 }} transition={{ type: "spring", stiffness: 300 }}
        >
          <ArrowLeft size={18} className="mr-2 group-hover:text-green-200 transition-colors" /> <span className="group-hover:underline">Volver a la lista de eventos</span>
        </motion.button>

        <motion.div 
          initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-gray-800 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl border border-gray-700"
        >
          <div className="relative h-64 md:h-80 lg:h-96 w-full"> {/* No más 'group' aquí */}
            <Image
              src={evento.imagen_url || '/placeholder-event.jpg'}
              alt={evento.nombre_evento || "Imagen del evento"}
              fill
              className="object-cover" // Quitada clase group-hover:scale-105
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 80vw, 60vw"
              priority
              quality={80}
              onError={(e) => { e.target.onerror = null; e.target.src = '/placeholder-event.jpg';}}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent"></div>
            
            <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                {evento.isPastEvent ? (
                    <span className="bg-slate-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center"><Clock size={14} className="mr-1.5"/>Finalizado</span>
                ) : registrationCheckLoading ? (
                    <span className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center"><Loader size={14} className="mr-1.5 animate-spin"/>Verificando...</span>
                ) : isRegistered ? (
                    <span className="bg-purple-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center"><CheckCircle size={14} className="mr-1.5"/>Inscrito</span>
                ) : (evento.cupos !== null && evento.cupos_disponibles <= 0) ? (
                    <span className="bg-red-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center"><XCircle size={14} className="mr-1.5"/>Cupos Llenos</span>
                ) : (
                    <span className="bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">Disponible</span>
                )}
                {evento.tipo_evento_display && (
                    <span className="bg-sky-600/80 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center backdrop-blur-sm">
                        <Tag size={14} className="mr-1.5" />
                        {evento.tipo_evento_display}
                    </span>
                )}
            </div>
          </div>

          <div className="p-6 md:p-8 lg:p-10">
            <motion.h1 
              initial={{ opacity: 0, y:10 }} animate={{ opacity: 1, y:0 }} transition={{ delay: 0.2, duration: 0.5 }}
              className="text-3xl md:text-4xl lg:text-5xl font-extrabold mb-3 md:mb-4 
                         text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-teal-300 to-sky-400 leading-tight"
            >
              {evento.nombre_evento}
            </motion.h1>
            
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }} 
              className="text-gray-300 mb-6 md:mb-8 flex items-center text-base md:text-lg"
            >
              <Calendar size={18} className="mr-2.5 text-green-400 flex-shrink-0"/>
              {new Date(evento.fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </motion.div>

            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }} 
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-10"
            >
              <InfoCard icon={<Clock size={20}/>} title="Horario">
                {formatTime(evento.hora_inicio)} - {formatTime(evento.hora_fin)}
              </InfoCard>
              
              <InfoCard icon={<Users size={20}/>} title="Cupos">
                {evento.cupos !== null ? 
                  `${evento.asistentes_count || 0} / ${evento.cupos} (${Math.max(0, evento.cupos_disponibles ?? evento.cupos - (evento.asistentes_count || 0) )} disponibles)` : 
                  'Cupos ilimitados'}
              </InfoCard>

              {evento.costo > 0 && (
                <InfoCard icon={<DollarSign size={20}/>} title="Costo">
                  ${evento.costo.toFixed(2)} MXN
                </InfoCard>
              )}
            </motion.div>

            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.5 }} 
                className="mb-8 md:mb-10"
            >
              <h2 className="text-2xl md:text-3xl font-bold text-green-300 mb-3 md:mb-4 flex items-center">
                <Info size={24} className="mr-3"/>
                Acerca de este evento
              </h2>
              <article className="prose prose-base sm:prose-lg prose-invert max-w-none 
                                text-gray-200/90 whitespace-pre-line leading-relaxed 
                                prose-headings:text-green-200 prose-a:text-teal-300 hover:prose-a:text-teal-200
                                prose-strong:text-gray-100">
                {evento.descripcion || 'No hay descripción detallada para este evento.'}
              </article>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.5 }} 
                className="border-t border-gray-700 pt-6 md:pt-8"
            >
              <Button 
                onClick={handleParticipateFlow}
                variant={isRegistered ? 'danger' : (evento.isPastEvent || !canParticipate) ? 'disabled' : 'primary'}
                className="w-full md:w-auto text-base md:text-lg py-3 px-8 shadow-lg"
                disabled={actionLoading || registrationCheckLoading || (evento.isPastEvent || (!isRegistered && !canParticipate))}
                loading={actionLoading || registrationCheckLoading}
              >
                {registrationCheckLoading ? 'Verificando...' : 
                 isRegistered ? 'Cancelar Inscripción' : 
                 evento.isPastEvent ? 'Evento Finalizado' : 
                 !canParticipate ? 'Cupos Agotados' : 
                 'Inscribirme al Evento'}
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Modals */}
      <Modal isOpen={showUnregisterModal} onClose={() => setShowUnregisterModal(false)} title="Confirmar Cancelación">
        <p className="text-gray-300 mb-6">¿Estás seguro de que deseas cancelar tu inscripción para "{evento?.nombre_evento}"?</p>
        <div className="flex justify-end space-x-3">
          <Button onClick={() => setShowUnregisterModal(false)} variant="secondary" disabled={actionLoading}>No, mantener</Button>
          <Button onClick={() => handleApiRegistration('unregister')} variant="danger" loading={actionLoading} disabled={actionLoading}>Sí, cancelar</Button>
        </div>
      </Modal>

      <Modal isOpen={showRegistrationTypeModal} onClose={() => setShowRegistrationTypeModal(false)} title="Confirmar Inscripción">
         <p className="text-gray-300 mb-6">¿Cómo deseas inscribirte al evento "{evento?.nombre_evento}"?</p>
        <div className="space-y-3">
          <Button 
            onClick={() => {
                setShowRegistrationTypeModal(false);
                const fromURL = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
                router.push(`/iniciar?registerEvent=${id}&from=${encodeURIComponent(fromURL)}`);
            }} 
            variant="primary" 
            className="w-full flex items-center justify-center"
            disabled={actionLoading}
          >
            <LogIn size={18} className="mr-2"/>Soy miembro (Iniciar sesión)
          </Button>
          <Button 
            onClick={() => { setShowRegistrationTypeModal(false); setShowGuestFormModal(true); }} 
            variant="secondary" 
            className="w-full flex items-center justify-center"
            disabled={actionLoading}
          >
            <UserPlus size={18} className="mr-2"/>Soy invitado
          </Button>
        </div>
      </Modal>

      <Modal 
        isOpen={showGuestFormModal} 
        onClose={() => { setShowGuestFormModal(false); setFormErrors({}); }} 
        title={`Inscripción como Invitado: ${evento?.nombre_evento || ''}`}
      >
        <form onSubmit={(e) => { e.preventDefault(); handleGuestRegistrationSubmit(); }} className="space-y-4">
          <Input label="Nombre completo *" name="nombre_completo" value={guestData.nombre_completo} onChange={handleGuestInputChange} required error={formErrors.nombre_completo} className="bg-gray-700 border-gray-600 focus:border-green-500"/>
          <Input label="Correo electrónico *" type="email" name="correo_electronico" value={guestData.correo_electronico} onChange={handleGuestInputChange} required error={formErrors.correo_electronico} className="bg-gray-700 border-gray-600 focus:border-green-500"/>
          <Input label="Número de teléfono *" name="numero_telefono" value={guestData.numero_telefono} onChange={handleGuestInputChange} required placeholder="10 dígitos" error={formErrors.numero_telefono} className="bg-gray-700 border-gray-600 focus:border-green-500"/>
          <Select label="Carrera *" name="carrera" value={guestData.carrera} onChange={handleGuestInputChange} options={carreras.map(c => ({ value: c, label: c }))} placeholder="Selecciona tu carrera" required error={formErrors.carrera} classNameForSelect="bg-gray-700 border-gray-600 focus:border-green-500"/> {/* Asegúrate que `classNameForSelect` sea aplicado correctamente por tu componente `Select` */}
          <Select label="Semestre *" name="semestre" value={guestData.semestre} onChange={handleGuestInputChange} options={semestres} placeholder="Selecciona tu semestre" required error={formErrors.semestre} classNameForSelect="bg-gray-700 border-gray-600 focus:border-green-500"/>
          <div className="flex justify-end space-x-3 pt-3">
            <Button type="button" onClick={() => { setShowGuestFormModal(false); setFormErrors({}); }} variant="secondary" disabled={actionLoading}>Cancelar</Button>
            <Button type="submit" variant="primary" loading={actionLoading} disabled={actionLoading}>{actionLoading ? "Inscribiendo..." : "Confirmar Inscripción"}</Button>
          </div>
        </form>
      </Modal>
    </motion.main>
  );
}

// Componente para las tarjetas de información (Horario, Cupos, Costo)
const InfoCard = ({ icon, title, children }) => (
  <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600/50 shadow-lg">
    <h3 className="text-green-300 font-semibold mb-2 flex items-center text-sm md:text-base">
      {icon && <span className="mr-2">{icon}</span>}
      {title}
    </h3>
    <p className="text-gray-200 text-sm md:text-base">{children}</p>
  </div>
);

export default function EventoDetallePage() {
    return (
      <Suspense fallback={<LoadingSpinner fullScreen text="Cargando evento..." />}>
        <EventoDetalleContent />
      </Suspense>
    );
}