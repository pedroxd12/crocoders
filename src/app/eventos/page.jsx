// src/app/eventos/page.jsx
'use client';
import { useEffect, useMemo, useState, Suspense } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { fetcher, postFetcher } from '@/lib/fetcher';
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
import styles from './page.module.css';

async function sendEventRegistrationEmail(email, name, eventDetails, qrToken) {
  const response = await fetch('/api/confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, eventDetails, qrToken }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'No se pudo enviar el correo de confirmación');
  }
}

function EventosContent() {
  const [filteredEvents, setFilteredEvents] = useState([]);
  // Overrides locales de estado de registro tras inscribirse, para reflejar el
  // cambio al instante sin esperar a que SWR revalide.
  const [registrationOverrides, setRegistrationOverrides] = useState({});
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


  // SWR: la lista de eventos se cachea y revalida sola; al volver a la página
  // se muestra al instante desde caché en lugar de refetch bloqueante.
  const {
    data: eventosRaw,
    error: eventosError,
    isLoading: eventosLoading,
    mutate: mutateEventos,
  } = useSWR('/api/eventos', fetcher, { revalidateOnFocus: false });

  // Procesa fechas/estados una sola vez por cambio de datos (antes en cada fetch).
  const eventos = useMemo(() => {
    if (!Array.isArray(eventosRaw)) return [];
    const now = new Date();
    return eventosRaw.map((evento) => {
      let registroCerrado = false;
      if (evento.fecha_limite_registro) {
        registroCerrado = now > new Date(evento.fecha_limite_registro);
      }
      const fechaFin = evento.fecha_fin || evento.fecha;
      const horaFin = evento.hora_fin || '23:59';
      const fechaFinCompleta = `${fechaFin}T${horaFin}`;
      return {
        ...evento,
        fecha: new Date(evento.fecha + 'T00:00:00').toISOString().split('T')[0],
        isPastEvent: new Date(fechaFinCompleta) < now,
        registroCerrado,
      };
    });
  }, [eventosRaw]);

  // Estado de registro del usuario. Corre en paralelo (no en cascada bloqueante):
  // la lista de eventos se muestra de inmediato y este lookup llega después.
  const eventIds = useMemo(() => eventos.map((e) => e.id_evento), [eventos]);
  const canCheckRegistration =
    isAuthenticated && user?.id_miembro && eventIds.length > 0;

  const { data: batchData, mutate: mutateBatch } = useSWR(
    canCheckRegistration
      ? ['/api/eventos/check-register-batch', { eventIds, userId: user.id_miembro }]
      : null,
    postFetcher,
    { revalidateOnFocus: false }
  );

  const registrationStatus = useMemo(
    () => ({ ...(batchData?.registered || {}), ...registrationOverrides }),
    [batchData, registrationOverrides]
  );

  const loading = eventosLoading;
  const error = eventosError ? 'Error al cargar eventos' : null;
  const fetchEventos = () => mutateEventos();

  useEffect(() => {
    const registered = searchParams.get('registered');
    const eventId = searchParams.get('eventId');
    if (registered === 'true' && eventId) {
      setRegistrationOverrides((prev) => ({ ...prev, [eventId]: true }));
      toast.success('¡Registro exitoso!');
      router.replace('/eventos', { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    let tempFiltered = [...eventos];
    if (filters.tipo !== 'todos') {
      tempFiltered = tempFiltered.filter((e) => e.tipo === filters.tipo);
    }
    if (filters.estado === 'proximos') {
      tempFiltered = tempFiltered.filter((e) => !e.isPastEvent);
    } else if (filters.estado === 'pasados') {
      tempFiltered = tempFiltered.filter((e) => e.isPastEvent);
    }
    if (filters.hermandad !== 'todos') {
      tempFiltered = tempFiltered.filter((e) => e.hermandad === filters.hermandad);
    }
    setFilteredEvents(tempFiltered);
  }, [filters, eventos]);

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

      setRegistrationOverrides(prev => ({ ...prev, [evento.id_evento]: true }));
      mutateEventos(); // refresca cupos desde el servidor
      mutateBatch();   // revalida estado de registro real
      toast.success('¡Registro exitoso!', { theme: "dark" });
      sendEventRegistrationEmail(user.correo_electronico, user.nombre_completo, result.event, result.qrToken)
        .catch(() => toast.warning('Te inscribiste, pero no pudimos enviar el correo de confirmación.', { theme: 'dark' }));
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

      setRegistrationOverrides(prev => ({ ...prev, [selectedEventForRegistration.id_evento]: true }));
      mutateEventos(); // refresca cupos desde el servidor
      toast.success('¡Registro como invitado exitoso!', { theme: "dark" });
      sendEventRegistrationEmail(guestData.correo_electronico, guestData.nombre_completo, attendanceResult.event, attendanceResult.qrToken)
        .catch(() => toast.warning('Te inscribiste, pero no pudimos enviar el correo de confirmación.', { theme: 'dark' }));
      
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
    <div className={styles.pageWrapper}>
      <main className={styles.container}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.6 }}
        >
          <h1 className={styles.title}>Nuestros Eventos</h1>
          <p className={styles.description}>
            Participa en conferencias, talleres y concursos diseñados para impulsar tu crecimiento profesional.
          </p>
        </motion.div>

        <div className={styles.filtersContainer}>
           <FilterControls filters={filters} onFilterChange={handleFilterChange} />
        </div>

        {filteredEvents.length === 0 ? (
           <div className={styles.emptyState}>
              <p>No se encontraron eventos con los filtros actuales.</p>
              {eventos.length > 0 && (
                <Button 
                  onClick={() => setFilters({ tipo: 'todos', estado: 'proximos', hermandad: 'todos' })} 
                  variant="secondary" 
                  className="mt-4"
                >
                  Limpiar Filtros
                </Button>
              )}
           </div>
        ) : (
          <div className={styles.grid}>
             {filteredEvents.map((evento, index) => (
                <EventCard 
                  key={evento.id_evento} 
                  evento={evento} 
                  isRegistered={registrationStatus[evento.id_evento]}
                  onParticipate={() => handleParticipateClick(evento)}
                  onViewDetails={() => handleViewDetails(evento.id_evento)}
                  userId={user?.id_miembro}
                  index={index}
                />
             ))}
          </div>
        )}
      </main>

      <Modal isOpen={showRegistrationTypeModal} onClose={() => setShowRegistrationTypeModal(false)} title="Confirmar Registro">
        <p className="text-gray-300 mb-6">¿Cómo deseas registrarte al evento "{selectedEventForRegistration?.nombre_evento}"?</p>
        <div className="space-y-3">
          <Button onClick={() => router.push(`/iniciar?redirect=/eventos?eventId=${selectedEventForRegistration?.id_evento}`)} variant="primary" className="w-full justify-center"><LogIn size={18} className="mr-2"/>Soy miembro (Iniciar sesión)</Button>
          <Button onClick={() => { setShowRegistrationTypeModal(false); setShowGuestFormModal(true); }} variant="secondary" className="w-full justify-center"><UserPlus size={18} className="mr-2"/>Soy invitado</Button>
        </div>
      </Modal>

      <Modal isOpen={showGuestFormModal} onClose={() => { setShowGuestFormModal(false); setFormErrors({}); }} title={`Registro como Invitado`}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1 custom-scrollbar">
          <Input label="Nombre completo" name="nombre_completo" value={guestData.nombre_completo} onChange={(e) => setGuestData({...guestData, nombre_completo: e.target.value})} error={formErrors.nombre_completo} placeholder="Nombre Completo" />
          <Input label="Correo electrónico" type="email" name="correo_electronico" value={guestData.correo_electronico} onChange={(e) => setGuestData({...guestData, correo_electronico: e.target.value})} error={formErrors.correo_electronico} placeholder="correo@ejemplo.com" />
          <Input label="Teléfono" name="numero_telefono" value={guestData.numero_telefono} onChange={(e) => setGuestData({...guestData, numero_telefono: e.target.value.replace(/\D/g, '').slice(0, 10)})} placeholder="10 dígitos" error={formErrors.numero_telefono} />
          <Select label="Carrera" name="carrera" value={guestData.carrera} onChange={(e) => setGuestData({...guestData, carrera: e.target.value})} options={carreras.map(c => ({ value: c, label: c }))} placeholder="Selecciona tu carrera" error={formErrors.carrera} />
          <Select label="Semestre" name="semestre" value={guestData.semestre} onChange={(e) => setGuestData({...guestData, semestre: e.target.value})} options={semestres} placeholder="Selecciona tu semestre" error={formErrors.semestre} />
          
          <div className="flex justify-end space-x-3 pt-3">
            <Button onClick={() => { setShowGuestFormModal(false); setFormErrors({}); }} variant="secondary" disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={handleGuestRegistrationSubmit} variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Registrando..." : "Confirmar Registro"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function EventosPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen text="Cargando eventos..." />}>
      <EventosContent />
    </Suspense>
  );
}