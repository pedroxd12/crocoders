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
import { Calendar, Users, Clock, ArrowLeft, CheckCircle, XCircle, UserPlus, LogIn, AlertTriangle, DollarSign, Loader } from 'lucide-react';

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
  const [registrationCheckLoading, setRegistrationCheckLoading] = useState(true); // Start as true

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
    console.log(`[${new Date().toISOString()}] Fetching event details for ID: ${id}`);
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
      
      console.log(`[${new Date().toISOString()}] Event details fetched:`, data.nombre_evento);
      setEvento({
        ...data,
        fecha: new Date(data.fecha).toISOString().split('T')[0],
        isPastEvent: eventEndDate < now
      });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error fetching event details:`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);
  
  const checkUserRegistration = useCallback(async (currentEvento, currentUser) => {
    if (!currentEvento || !currentUser?.id_miembro) {
      console.log(`[${new Date().toISOString()}] CheckUserRegistration: Prerequisites not met. Evento: ${!!currentEvento}, User ID: ${currentUser?.id_miembro}`);
      setIsRegistered(false);
      setRegistrationCheckLoading(false);
      return;
    }

    console.log(`[${new Date().toISOString()}] Checking registration for event ID: ${currentEvento.id_evento}, User ID: ${currentUser.id_miembro}`);
    setRegistrationCheckLoading(true);
    try {
      const res = await fetch(`/api/eventos/check-register?id=${currentEvento.id_evento}&userId=${currentUser.id_miembro}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({error: 'Error al verificar estado de registro'}));
        console.error(`[${new Date().toISOString()}] API error checking registration:`, errData.error);
        throw new Error(errData.error ||'Error al verificar estado de registro');
      }
      const data = await res.json();
      console.log(`[${new Date().toISOString()}] Registration status from API: ${data.registered}`);
      setIsRegistered(data.registered);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error in checkUserRegistration API call:`, err.message);
      setIsRegistered(false);
    } finally {
      // Log del estado final después del fetch
      setRegistrationCheckLoading(false);
      // Es importante no usar `isRegistered` directamente aquí para el log porque su actualización es asíncrona.
      // El `console.log` dentro del try/catch para `data.registered` es más fiable para el valor inmediato.
      console.log(`[${new Date().toISOString()}] Finished registration check. Loading: false`);
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchEventoDetails();
    }
  }, [id, fetchEventoDetails]);

  useEffect(() => {
    console.log(`[${new Date().toISOString()}] Auth/Event Effect triggered. AuthLoading: ${authLoading}, EventLoading: ${loading}, Event: ${!!evento}, User: ${!!user}, IsAuthenticated: ${isAuthenticated}`);
    if (!authLoading && !loading && evento && isAuthenticated && user) {
      checkUserRegistration(evento, user);
    } else if (!isAuthenticated && !authLoading && !loading) {
      console.log(`[${new Date().toISOString()}] User not authenticated. Setting isRegistered to false.`);
      setIsRegistered(false);
      setRegistrationCheckLoading(false);
    }
  }, [evento, user, isAuthenticated, authLoading, loading, checkUserRegistration]);

  useEffect(() => {
    const registeredParam = searchParams.get('registered');
    const eventIdParam = searchParams.get('eventId');
    if (registeredParam === 'true' && eventIdParam === id) {
      console.log(`[${new Date().toISOString()}] Registered via query param. Event ID: ${eventIdParam}`);
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
    
    console.log(`[${new Date().toISOString()}] API Registration call. Type: ${type}, Endpoint: ${endpoint}, UserID: ${userIdToUse}, UserType: ${userType}, EventID: ${evento.id_evento}`);

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
          console.error(`[${new Date().toISOString()}] Error procesando invitado:`, guestResult.error);
          throw new Error(guestResult.error || 'Error al procesar datos de invitado');
        }
        requestBody.userId = guestResult.id_invitado;
        console.log(`[${new Date().toISOString()}] Invitado procesado, ID: ${guestResult.id_invitado}`);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const result = await response.json();
      if (!response.ok) {
        console.error(`[${new Date().toISOString()}] Error en API ${type}:`, result.error);
        throw new Error(result.error || `Error en ${type}`);
      }
      
      console.log(`[${new Date().toISOString()}] API ${type} exitoso. Result:`, result);
      setIsRegistered(type === 'register'); 
      if (result.event) {
        setEvento(prev => ({...prev, ...result.event, isPastEvent: prev.isPastEvent})); 
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
      console.error(`[${new Date().toISOString()}] Catch block en handleApiRegistration (${type}):`, error.message);
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
      className="min-h-screen bg-gradient-to-b from-gray-900 via-slate-800 to-gray-900 text-white py-8 md:py-12 px-4"
    >
      <div className="max-w-4xl mx-auto">
        <motion.button 
          onClick={() => router.push('/eventos')}
          className="flex items-center text-green-400 hover:text-green-300 mb-8 group"
          whileHover={{ x: -3 }} transition={{ type: "spring", stiffness: 300 }}
        >
          <ArrowLeft size={20} className="mr-2 group-hover:text-green-200 transition-colors" /> <span className="group-hover:underline">Volver a eventos</span>
        </motion.button>

        <motion.div 
          initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-gray-800/70 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl border border-gray-700/60"
        >
          <div className="relative h-72 md:h-96 w-full group">
            <Image
              src={evento.imagen_url || '/placeholder-event.jpg'}
              alt={evento.nombre_evento || "Imagen del evento"}
              fill
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 80vw, 60vw"
              priority
              quality={80}
              onError={(e) => { e.target.onerror = null; e.target.src = '/placeholder-event.jpg';}}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
            <div className="absolute top-4 right-4">
                {evento.isPastEvent ? (
                    <span className="bg-slate-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center font-medium"><Clock size={14} className="mr-1.5"/>Finalizado</span>
                ) : registrationCheckLoading ? (
                    <span className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center font-medium"><Loader size={14} className="mr-1.5 animate-spin"/>Verificando...</span>
                ) : isRegistered ? (
                    <span className="bg-purple-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center font-medium"><CheckCircle size={14} className="mr-1.5"/>Inscrito</span>
                ) : (evento.cupos !== null && evento.cupos_disponibles <= 0) ? (
                    <span className="bg-red-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center font-medium"><XCircle size={14} className="mr-1.5"/>Cupos Llenos</span>
                ) : (
                    <span className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg font-medium">Disponible</span>
                )}
            </div>
          </div>

          <div className="p-6 md:p-10">
            <motion.h1 
              initial={{ opacity: 0, y:10 }} animate={{ opacity: 1, y:0 }} transition={{ delay: 0.2, duration: 0.5 }}
              className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-teal-300 to-sky-300 mb-3"
            >
              {evento.nombre_evento}
            </motion.h1>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }} 
              className="text-gray-300 mb-6 flex items-center text-lg"
            >
              <Calendar size={18} className="mr-2.5 text-green-400 flex-shrink-0"/>
              {new Date(evento.fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </motion.div>
            
            {evento.costo > 0 && (
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35, duration: 0.5 }}
                    className="mb-6 inline-flex items-center bg-yellow-500/10 text-yellow-200 px-4 py-2 rounded-full text-lg font-semibold border border-yellow-500/30"
                >
                    <DollarSign size={20} className="mr-2"/> Costo: ${evento.costo.toFixed(2)} MXN
                </motion.div>
            )}

            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }} 
                className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-8"
            >
              <div className="bg-gray-700/40 p-5 rounded-xl border border-gray-600/30 shadow-lg">
                <h3 className="text-green-300 font-semibold mb-2 flex items-center text-lg"><Clock size={20} className="mr-2"/>Horario</h3>
                <p className="text-gray-200">Inicio: {formatTime(evento.hora_inicio)} <br /> Fin: {formatTime(evento.hora_fin)}</p>
              </div>
              <div className="bg-gray-700/40 p-5 rounded-xl border border-gray-600/30 shadow-lg">
                <h3 className="text-green-300 font-semibold mb-2 flex items-center text-lg"><Users size={20} className="mr-2"/>Cupos</h3>
                <p className="text-gray-200">
                  {evento.cupos !== null ? 
                    `${evento.asistentes_count || 0} / ${evento.cupos} (${Math.max(0, evento.cupos_disponibles ?? evento.cupos - (evento.asistentes_count || 0) )} disponibles)` : 
                    'Cupos ilimitados'}
                </p>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.5 }} className="mb-8">
              <h2 className="text-2xl font-bold text-green-300 mb-3">Descripción del Evento</h2>
              <article className="prose prose-sm sm:prose-base prose-invert max-w-none text-gray-200 whitespace-pre-line leading-relaxed">
                {evento.descripcion || 'No hay descripción detallada para este evento.'}
              </article>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.5 }} 
                className="border-t border-gray-700/50 pt-8"
            >
              <Button 
                onClick={handleParticipateFlow}
                variant={isRegistered ? 'danger' : (evento.isPastEvent || !canParticipate) ? 'disabled' : 'primary'}
                className="w-full md:w-auto text-lg py-3.5 px-8 shadow-lg"
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

export default function EventoDetallePage() {
    return (
      <Suspense fallback={<LoadingSpinner fullScreen text="Cargando evento..." />}>
        <EventoDetalleContent />
      </Suspense>
    );
}