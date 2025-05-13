// src/app/eventos/page.jsx
'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-toastify';
import EventCard from '@/components/EventCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import FilterControls from '@/components/FilterControls';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input'; 
import Select from '@/components/ui/Select'; 
import Image from 'next/image'; // Added for completeness, though EventCard handles its own image

import { Calendar, Filter, Loader, UserPlus, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

async function sendEventRegistrationEmail(email, name, eventDetails) {
  try {
    const response = await fetch('/api/confirmation', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, eventDetails }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Error al enviar correo');
    return result;
  } catch (error) {
    console.error('Error al enviar correo de confirmación:', error);
  }
}

function EventosContent() {
  const [eventos, setEventos] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [registrationStatus, setRegistrationStatus] = useState({});
  const [filters, setFilters] = useState({
    tipo: 'todos',
    estado: 'proximos', 
    hermandad: 'todos'
  });
  const [selectedEventForRegistration, setSelectedEventForRegistration] = useState(null);
  const [showRegistrationTypeModal, setShowRegistrationTypeModal] = useState(false);
  const [showGuestFormModal, setShowGuestFormModal] = useState(false);
  
  const [guestData, setGuestData] = useState({
    nombre_completo: '',
    correo_electronico: '',
    numero_telefono: '',
    semestre: '',
    carrera: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const carreras = [
    'Ingeniería en Sistemas Computacionales', 'Ingeniería en Electronica', 
    'Ingeniería Industrial', 'Ingeniería Quimica', 
    'Ingeniería en Logistica', 'Ingeniería en Mecatronica',
  ];
  const semestres = Array.from({ length: 14 }, (_, i) => ({ value: (i + 1).toString(), label: `${i + 1}° Semestre` }));


  useEffect(() => {
    if (authLoading) return;
    
    fetchEventos();
    
    const registered = searchParams.get('registered');
    const eventId = searchParams.get('eventId');
    
    if (registered === 'true' && eventId) {
      setRegistrationStatus(prev => ({ ...prev, [eventId]: true }));
      toast.success('¡Registro exitoso!');
      router.replace('/eventos', { scroll: false }); 
    }
  }, [isAuthenticated, user?.id_miembro, authLoading, searchParams, router]);

  const fetchEventos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/eventos');
      if (!res.ok) throw new Error('Error al cargar eventos');
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Formato de datos inesperado');
      
      const now = new Date();
      const formattedEvents = data.map(evento => ({
        ...evento,
        fecha: new Date(evento.fecha).toISOString().split('T')[0],
        isPastEvent: new Date(`${evento.fecha}T${evento.hora_fin || '23:59'}`) < now
      }));
      
      setEventos(formattedEvents);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
 useEffect(() => {
    if (eventos.length > 0 && isAuthenticated && user?.id_miembro) {
      checkAllRegistrationStatuses(eventos, user);
    } else if (!isAuthenticated) {
      setRegistrationStatus({});
    }
  }, [eventos, isAuthenticated, user?.id_miembro]);


  const checkAllRegistrationStatuses = async (eventosData, currentUser) => {
    if (!currentUser?.id_miembro) {
      setRegistrationStatus({});
      return;
    }
    try {
      const statusPromises = eventosData.map(evento => 
        fetch(`/api/eventos/check-register?id=${evento.id_evento}&userId=${currentUser.id_miembro}`)
          .then(res => res.ok ? res.json() : { registered: false })
          .then(data => ({ id: evento.id_evento, registered: data.registered }))
          .catch(() => ({ id: evento.id_evento, registered: false }))
      );
      const statuses = await Promise.all(statusPromises);
      setRegistrationStatus(statuses.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.registered }), {}));
    } catch (error) {
      console.error("Error checking all registration statuses:", error);
    }
  };

  useEffect(() => {
    applyFilters();
  }, [filters, eventos]);

  const applyFilters = () => {
    let tempFiltered = [...eventos];
    if (filters.tipo !== 'todos') {
      tempFiltered = tempFiltered.filter(e => e.tipo === filters.tipo);
    }
    if (filters.estado === 'proximos') {
      tempFiltered = tempFiltered.filter(e => !e.isPastEvent);
    } else if (filters.estado === 'pasados') {
      tempFiltered = tempFiltered.filter(e => e.isPastEvent);
    }
    if (filters.hermandad !== 'todos') {
      tempFiltered = tempFiltered.filter(e => e.hermandad === filters.hermandad);
    }
    setFilteredEvents(tempFiltered);
  };

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

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

  const handleParticipateClick = (evento) => {
    setSelectedEventForRegistration(evento);
    if (registrationStatus[evento.id_evento]) {
      // User is already registered, redirect to event detail or show message
      router.push(`/eventos/${evento.id_evento}?status=registered`);
      return;
    }
    if (evento.isPastEvent || (evento.cupos !== null && evento.cupos_disponibles <= 0)) {
      toast.info(evento.isPastEvent ? 'Este evento ya ha finalizado.' : 'No hay cupos disponibles.', { theme: "dark" });
      return;
    }
    if (isAuthenticated) {
      handleMemberRegistration(evento);
    } else {
      setShowRegistrationTypeModal(true);
    }
  };

  const handleMemberRegistration = async (evento) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/eventos/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventoId: evento.id_evento, userId: user.id_miembro, tipo: 'miembro' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Error al registrar');
      
      setRegistrationStatus(prev => ({ ...prev, [evento.id_evento]: true }));
      setEventos(prevEventos => prevEventos.map(e => e.id_evento === evento.id_evento ? result.event : e));
      toast.success('¡Registro exitoso!', { theme: "dark" });
      sendEventRegistrationEmail(user.correo_electronico, user.nombre_completo, result.event);
      setShowRegistrationTypeModal(false);
    } catch (error) {
      toast.error(`Error: ${error.message}`, { theme: "dark" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuestRegistrationSubmit = async () => {
    if (!validateGuestForm()) return;
    setIsSubmitting(true);
    try {
      const guestRes = await fetch('/api/invitados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guestData),
      });
      const guestResult = await guestRes.json();
      if (!guestRes.ok) throw new Error(guestResult.error || 'Error al crear invitado');

      const attendanceRes = await fetch('/api/eventos/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventoId: selectedEventForRegistration.id_evento,
          userId: guestResult.id_invitado,
          tipo: 'invitado'
        }),
      });
      const attendanceResult = await attendanceRes.json();
      if (!attendanceRes.ok) throw new Error(attendanceResult.error || 'Error al registrar asistencia');

      setRegistrationStatus(prev => ({ ...prev, [selectedEventForRegistration.id_evento]: true }));
      setEventos(prevEventos => prevEventos.map(e => e.id_evento === selectedEventForRegistration.id_evento ? attendanceResult.event : e));
      toast.success('¡Registro como invitado exitoso!', { theme: "dark" });
      sendEventRegistrationEmail(guestData.correo_electronico, guestData.nombre_completo, attendanceResult.event);
      
      setShowGuestFormModal(false);
      setShowRegistrationTypeModal(false);
      setGuestData({ nombre_completo: '', correo_electronico: '', numero_telefono: '', semestre: '', carrera: '' });
      setFormErrors({});
    } catch (error) {
      toast.error(`Error: ${error.message}`, { theme: "dark" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleViewDetails = (eventoId) => {
    router.push(`/eventos/${eventoId}`);
  };

  if (authLoading || loading) return <LoadingSpinner fullScreen text="Cargando eventos..." />;
  if (error) return <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-900 text-red-400"><p>{error}</p><Button onClick={fetchEventos}>Reintentar</Button></div>;

  return (
    <motion.main 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
      className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white py-6 px-3 sm:py-10 sm:px-6"
    >
      <div className="max-w-7xl mx-auto">
        <section className="space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}
            className="text-center mb-8 space-y-2"
          >
            <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-teal-400">
              Explora Nuestros Eventos
            </h1>
            <p className="text-gray-300 text-md sm:text-lg max-w-2xl mx-auto">
              Conferencias, talleres, concursos y más. ¡Encuentra tu próxima aventura de aprendizaje!
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="mb-8">
            <FilterControls filters={filters} onFilterChange={handleFilterChange} />
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }} className="flex items-center justify-between mb-6 px-1">
            <div className="flex items-center text-gray-300 text-sm"><Calendar size={16} className="mr-2 text-green-400" /><span>{filteredEvents.length} eventos encontrados</span></div>
            <Button onClick={fetchEventos} variant="text" size="sm" className="flex items-center text-green-400 hover:text-green-300"><Loader size={16} className="mr-1 animate-spin-slow" />Actualizar</Button>
          </motion.div>

          {filteredEvents.length === 0 ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="py-10 px-4 bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-xl text-center border border-gray-700">
              <Filter size={32} className="mx-auto mb-4 text-gray-500" />
              <p className="text-gray-300 text-lg">{eventos.length === 0 ? 'No hay eventos programados por el momento.' : 'No se encontraron eventos con los filtros actuales.'}</p>
              {eventos.length > 0 && <Button onClick={() => setFilters({ tipo: 'todos', estado: 'proximos', hermandad: 'todos' })} variant="secondary" className="mt-6 text-sm py-2">Limpiar Filtros</Button>}
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {filteredEvents.map((evento, index) => (
                <motion.div key={evento.id_evento} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * index, duration: 0.4 }}>
                  <EventCard
                    evento={evento}
                    isRegistered={registrationStatus[evento.id_evento]}
                    onParticipate={() => handleParticipateClick(evento)}
                    onViewDetails={() => handleViewDetails(evento.id_evento)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal isOpen={showRegistrationTypeModal} onClose={() => setShowRegistrationTypeModal(false)} title="Confirmar Registro">
        <p className="text-gray-300 mb-6">¿Cómo deseas registrarte al evento "{selectedEventForRegistration?.nombre_evento}"?</p>
        <div className="space-y-3">
          <Button onClick={() => router.push(`/iniciar?registerEvent=${selectedEventForRegistration?.id_evento}&from=${encodeURIComponent(router.asPath || '/eventos')}`)} variant="primary" className="w-full flex items-center justify-center"><LogIn size={18} className="mr-2"/>Soy miembro (Iniciar sesión)</Button>
          <Button onClick={() => { setShowRegistrationTypeModal(false); setShowGuestFormModal(true); }} variant="secondary" className="w-full flex items-center justify-center"><UserPlus size={18} className="mr-2"/>Soy invitado</Button>
        </div>
      </Modal>

      <Modal isOpen={showGuestFormModal} onClose={() => { setShowGuestFormModal(false); setFormErrors({}); }} title={`Registro como Invitado: ${selectedEventForRegistration?.nombre_evento || ''}`}>
        <form onSubmit={(e) => { e.preventDefault(); handleGuestRegistrationSubmit(); }} className="space-y-4">
          <Input label="Nombre completo *" name="nombre_completo" value={guestData.nombre_completo} onChange={(e) => setGuestData({...guestData, nombre_completo: e.target.value})} required error={formErrors.nombre_completo} className="bg-gray-700 border-gray-600 focus:border-green-500"/>
          <Input label="Correo electrónico *" type="email" name="correo_electronico" value={guestData.correo_electronico} onChange={(e) => setGuestData({...guestData, correo_electronico: e.target.value})} required error={formErrors.correo_electronico} className="bg-gray-700 border-gray-600 focus:border-green-500"/>
          <Input label="Número de teléfono *" name="numero_telefono" value={guestData.numero_telefono} onChange={(e) => setGuestData({...guestData, numero_telefono: e.target.value})} required placeholder="10 dígitos" error={formErrors.numero_telefono} className="bg-gray-700 border-gray-600 focus:border-green-500"/>
          <Select label="Carrera *" name="carrera" value={guestData.carrera} onChange={(e) => setGuestData({...guestData, carrera: e.target.value})} options={carreras.map(c => ({ value: c, label: c }))} placeholder="Selecciona tu carrera" required error={formErrors.carrera} className="bg-gray-700 border-gray-600 focus:border-green-500"/>
          <Select label="Semestre *" name="semestre" value={guestData.semestre} onChange={(e) => setGuestData({...guestData, semestre: e.target.value})} options={semestres} placeholder="Selecciona tu semestre" required error={formErrors.semestre} className="bg-gray-700 border-gray-600 focus:border-green-500"/>
          
          <div className="flex justify-end space-x-3 pt-3">
            <Button type="button" onClick={() => { setShowGuestFormModal(false); setFormErrors({}); }} variant="secondary" disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>
              {isSubmitting ? <LoadingSpinner size="sm"/> : "Confirmar Registro"}
            </Button>
          </div>
        </form>
      </Modal>
    </motion.main>
  );
}

export default function EventosPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen text="Cargando eventos..." />}>
      <EventosContent />
    </Suspense>
  );
}