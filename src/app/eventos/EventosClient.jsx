// src/app/eventos/EventosClient.jsx
'use client';
import { useEffect, useMemo, useState, Suspense } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { fetcher, postFetcher } from '@/lib/fetcher';
import { aDiaISO, combinarFechaHora } from '@/lib/fechas';
import { toast } from 'react-toastify';
import EventCard from '@/components/EventCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import FilterControls from '@/components/FilterControls';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import {
  CamposInvitado,
  TallaModal,
  INVITADO_VACIO,
  validarInvitado,
  limpiarInvitadoPayload,
} from '@/components/eventos/RegistroInvitado';
import ComprobantePagoModal from '@/components/eventos/ComprobantePago';
import { enviarCorreoConfirmacion } from '@/lib/confirmacion-cliente';
import { esPorEquipos, ocupacionDeEvento } from '@/lib/aforo';

import { UserPlus, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from './page.module.css';

// Compara nombres de catálogo sin que una mayúscula o un acento vacíen la
// lista: la BD guarda "Concurso" y el filtro podía llevar "concurso".
const normalizar = (s) =>
  (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();


// `eventosIniciales` son los eventos que el Server Component de page.jsx ya
// consultó y mandó dentro del HTML. Se le entregan a SWR como `fallbackData`,
// así que el primer render pinta la lista completa sin pedir nada: la petición
// a /api/eventos deja de estar en el camino crítico y pasa a ser sólo la
// revalidación (al inscribirse, al volver a la pestaña).
function EventosContent({ eventosIniciales }) {
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
  // Talla de un MIEMBRO en eventos con `solicitar_talla`: su registro es de un
  // clic, así que se le pregunta en un mini-modal antes de confirmar.
  const [showTallaModal, setShowTallaModal] = useState(false);
  // Comprobante de pago del evento con costo recién inscrito. Se guarda el
  // ticket firmado que devolvió el registro: es la credencial con la que se
  // sube el archivo (quien se inscribe como invitado no tiene sesión).
  const [pagoPendiente, setPagoPendiente] = useState(null);

  // Los campos del invitado (nivel de estudios, edad, talla…) viven en el
  // componente compartido RegistroInvitado, el mismo del detalle y de programas.
  const [guestData, setGuestData] = useState(INVITADO_VACIO);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  // SWR: la lista de eventos se cachea y revalida sola; al volver a la página
  // se muestra al instante desde caché en lugar de refetch bloqueante.
  const {
    data: eventosRaw,
    error: eventosError,
    isLoading: eventosLoading,
    mutate: mutateEventos,
  } = useSWR('/api/eventos', fetcher, {
    revalidateOnFocus: false,
    fallbackData: eventosIniciales,
    // Sin esto SWR revalidaría nada más montar y volveríamos a pagar la ida al
    // servidor que el render en servidor acaba de ahorrarnos. Los datos que
    // llegaron con el HTML se acaban de leer de la base: son frescos.
    revalidateOnMount: eventosIniciales === undefined,
  });

  // Procesa fechas/estados una sola vez por cambio de datos (antes en cada fetch).
  //
  // `registro_cerrado` y `evento_terminado` los calcula el servidor en SQL con
  // la zona horaria del club (src/lib/eventos-fechas.js), incluyendo la regla
  // de "una hora antes del inicio" cuando no hay fecha límite. Aquí sólo se
  // consumen: recalcularlos en el navegador daba un veredicto distinto al del
  // POST de inscripción. El cálculo local queda de respaldo por si la respuesta
  // llega de una versión anterior del API.
  const eventos = useMemo(() => {
    if (!Array.isArray(eventosRaw)) return [];
    const now = new Date();
    return eventosRaw.map((evento) => {
      const cerradoLocal = evento.fecha_limite_registro
        ? now > new Date(evento.fecha_limite_registro)
        : false;
      const finLocal = combinarFechaHora(evento.fecha_fin || evento.fecha, evento.hora_fin, {
        finDelDia: true,
      });
      return {
        ...evento,
        // `aDiaISO` en lugar de `new Date(fecha).toISOString()`: reconstruir la
        // fecha y volver a serializarla en UTC devolvía el día anterior en
        // cualquier zona con desfase positivo.
        fecha: aDiaISO(evento.fecha),
        isPastEvent:
          typeof evento.evento_terminado === 'boolean'
            ? evento.evento_terminado
            : Boolean(finLocal && finLocal < now),
        registroCerrado:
          typeof evento.registro_cerrado === 'boolean' ? evento.registro_cerrado : cerradoLocal,
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

  // Los desplegables salen de los eventos realmente publicados. La lista fija
  // que había antes ('conferencia', 'curso', 'concurso', 'reunion') dejaba
  // fuera cualquier tipo nuevo del catálogo —Taller, Hackathon— y no había
  // forma de filtrarlo.
  const tiposDisponibles = useMemo(
    () => [...new Set(eventos.map((e) => e.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [eventos],
  );
  const hermandadesDisponibles = useMemo(
    () => [...new Set(eventos.map((e) => e.hermandad).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [eventos],
  );

  // Los eventos filtrados son un DERIVADO de `eventos` + `filters`, no un
  // estado propio. Antes se calculaban en un `useEffect` que llamaba a
  // `setFilteredEvents`, y eso tenía dos costes:
  //   - En el servidor los efectos NO corren, así que el HTML salía con la
  //     rejilla vacía y el cartel de "No se encontraron eventos": justo lo que
  //     el render en servidor pretende evitar. La lista sólo aparecía tras
  //     hidratar.
  //   - En el navegador, cada cambio de filtro provocaba un render de más
  //     (pintar con la lista vieja y volver a pintar con la nueva).
  // Como `useMemo`, el valor existe ya en el primer render, también en el
  // servidor. Es además lo que pedía la regla react-hooks/set-state-in-effect.
  const filteredEvents = useMemo(() => {
    let tempFiltered = [...eventos];
    if (filters.tipo !== 'todos') {
      tempFiltered = tempFiltered.filter((e) => normalizar(e.tipo) === normalizar(filters.tipo));
    }
    if (filters.estado === 'proximos') {
      tempFiltered = tempFiltered.filter((e) => !e.isPastEvent);
    } else if (filters.estado === 'pasados') {
      tempFiltered = tempFiltered.filter((e) => e.isPastEvent);
    }
    if (filters.hermandad !== 'todos') {
      tempFiltered = tempFiltered.filter(
        (e) => normalizar(e.hermandad) === normalizar(filters.hermandad),
      );
    }
    return tempFiltered;
  }, [filters, eventos]);

  const handleFilterChange = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const validateGuestForm = () => {
    const errors = validarInvitado(guestData, {
      requiereTalla: Boolean(selectedEventForRegistration?.solicitar_talla),
    });
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
    if (evento.isPastEvent) {
      toast.info('Este evento ya ha finalizado.', { theme: 'dark' });
      return;
    }
    if (evento.registroCerrado) {
      toast.info('El periodo de inscripción para este evento ha finalizado.', { theme: 'dark' });
      return;
    }
    if (ocupacionDeEvento(evento).lleno) {
      toast.info('No hay cupos disponibles.', { theme: 'dark' });
      return;
    }
    // Si la verificación de sesión sigue en vuelo, esperarla aquí (y no en
    // toda la página) evita ofrecerle el modal de invitado a un miembro que
    // pulsó dentro del primer medio segundo.
    if (authLoading) {
      toast.info('Un momento, verificando tu sesión…', { theme: 'dark' });
      return;
    }
    // Concurso por equipos: el formulario de equipo vive en el detalle. Antes
    // la tarjeta abría el flujo individual genérico y el evento "de concurso"
    // se inscribía como si fuera una conferencia.
    if (esPorEquipos(evento)) {
      router.push(`/eventos/${evento.id_evento}`);
      return;
    }
    if (isAuthenticated) {
      if (evento.solicitar_talla) {
        setShowTallaModal(true);
      } else {
        handleMemberRegistration(evento);
      }
    } else {
      setShowRegistrationTypeModal(true);
    }
  };

  const handleMemberRegistration = async (evento, tallaPlayera) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/eventos/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventoId: evento.id_evento,
          userId: user.id_miembro,
          tipo: 'miembro',
          ...(tallaPlayera ? { talla_playera: tallaPlayera } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Error al registrar');

      setRegistrationOverrides(prev => ({ ...prev, [evento.id_evento]: true }));
      mutateEventos(); // refresca cupos desde el servidor
      mutateBatch();   // revalida estado de registro real
      // Evento con costo: la inscripción nace 'pendiente' y lo siguiente es el
      // comprobante. Anunciar "¡Registro exitoso!" a secas hacía creer que el
      // lugar ya estaba confirmado.
      if (result.requiere_pago && result.qrToken) {
        setPagoPendiente({ evento, qrToken: result.qrToken });
        toast.info('Falta subir tu comprobante de pago.', { theme: 'dark' });
      } else {
        toast.success('¡Registro exitoso!', { theme: "dark" });
      }
      enviarCorreoConfirmacion(result.qrToken)
        .catch(() => toast.warning('Te inscribiste, pero no pudimos enviar el correo de confirmación.', { theme: 'dark' }));
      setShowRegistrationTypeModal(false);
      setShowTallaModal(false);
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
      // `limpiarInvitadoPayload` descarta los campos vacíos (un `semestre: ''`
      // se convertía en 0 en zod y devolvía 400) y los que no aplican al nivel
      // de estudios elegido.
      const datosInvitado = limpiarInvitadoPayload(guestData);
      const guestRes = await fetch('/api/invitados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosInvitado),
      });
      const guestResult = await guestRes.json();
      if (!guestRes.ok) throw new Error(guestResult.error || 'Error al crear invitado');

      const attendanceRes = await fetch('/api/eventos/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventoId: selectedEventForRegistration.id_evento,
          userId: guestResult.id_invitado,
          tipo: 'invitado',
          // Credencial firmada que devuelve /api/invitados. Sin ella el registro
          // de invitado se rechaza SIEMPRE: los id_invitado son secuenciales y
          // aceptarlos a secas permitía inscribir a terceros y quedarse con su QR.
          guestToken: guestResult.guestToken,
        }),
      });
      const attendanceResult = await attendanceRes.json();
      if (!attendanceRes.ok) throw new Error(attendanceResult.error || 'Error al registrar asistencia');

      setRegistrationOverrides(prev => ({ ...prev, [selectedEventForRegistration.id_evento]: true }));
      mutateEventos(); // refresca cupos desde el servidor
      if (attendanceResult.requiere_pago && attendanceResult.qrToken) {
        setPagoPendiente({ evento: selectedEventForRegistration, qrToken: attendanceResult.qrToken });
        toast.info('Falta subir tu comprobante de pago.', { theme: 'dark' });
      } else {
        toast.success('¡Registro como invitado exitoso!', { theme: "dark" });
      }
      enviarCorreoConfirmacion(attendanceResult.qrToken)
        .catch(() => toast.warning('Te inscribiste, pero no pudimos enviar el correo de confirmación.', { theme: 'dark' }));
      
      setShowGuestFormModal(false);
      setShowRegistrationTypeModal(false);
      setGuestData(INVITADO_VACIO);
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

  // El listado de eventos es PÚBLICO: no hace falta saber quién eres para
  // pintarlo. Antes esta guarda incluía `authLoading`, así que la pantalla se
  // quedaba en blanco hasta que /api/auth/verify —que consulta la base de
  // datos— contestara: medio segundo de espera añadido a CADA visita, incluida
  // la de quien no ha iniciado sesión nunca. La sesión sigue haciendo falta
  // para el estado de inscripción de cada tarjeta, pero eso llega solo por su
  // propio SWR y no debe retener la lista.
  if (loading) return <LoadingSpinner fullScreen text="Cargando eventos..." />;
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
           <FilterControls
              filters={filters}
              onFilterChange={handleFilterChange}
              tipos={tiposDisponibles}
              hermandades={hermandadesDisponibles}
           />
        </div>

        {filteredEvents.length === 0 ? (
           <div className={styles.emptyState}>
              <p>No se encontraron eventos con los filtros actuales.</p>
              {/* Restablecia `estado` a 'proximos', que es el filtro por defecto
                  y justo el que suele estar dejando la lista vacia: pulsar
                  "Limpiar filtros" no limpiaba nada y el usuario se quedaba ante
                  un vacio sin salida. Limpiar significa 'todos'. */}
              {eventos.length > 0 && (
                <Button
                  onClick={() => setFilters({ tipo: 'todos', estado: 'todos', hermandad: 'todos' })}
                  variant="secondary"
                  className="mt-4"
                >
                  Limpiar filtros
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
                  index={index}
                />
             ))}
          </div>
        )}
      </main>

      <Modal
        isOpen={showRegistrationTypeModal}
        onClose={() => setShowRegistrationTypeModal(false)}
        title="¿Cómo quieres registrarte?"
        description={selectedEventForRegistration?.nombre_evento}
        size="md"
      >
        <p className="mb-6 text-sm text-muted">Elige una opción para continuar con tu inscripción.</p>
        <div className="space-y-3">
          <Button onClick={() => router.push(`/iniciar?redirect=/eventos?eventId=${selectedEventForRegistration?.id_evento}`)} variant="primary" className="w-full justify-center"><LogIn size={18} className="mr-2"/>Soy miembro (Iniciar sesión)</Button>
          <Button onClick={() => { setShowRegistrationTypeModal(false); setShowGuestFormModal(true); }} variant="secondary" className="w-full justify-center"><UserPlus size={18} className="mr-2"/>Soy invitado</Button>
        </div>
      </Modal>

      <Modal
        isOpen={showGuestFormModal}
        onClose={() => { setShowGuestFormModal(false); setFormErrors({}); }}
        title="Registro como invitado"
        description={selectedEventForRegistration?.nombre_evento}
        size="lg"
        // Barra de acciones fija: el formulario es largo y en móvil los botones
        // quedaban por debajo del área visible.
        footer={
          <>
            <Button onClick={() => { setShowGuestFormModal(false); setFormErrors({}); }} variant="secondary" disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={handleGuestRegistrationSubmit} variant="primary" loading={isSubmitting}>
              Confirmar registro
            </Button>
          </>
        }
      >
        <CamposInvitado
          data={guestData}
          errors={formErrors}
          onChange={setGuestData}
          requiereTalla={Boolean(selectedEventForRegistration?.solicitar_talla)}
        />
      </Modal>

      {/* Comprobante de pago del evento con costo recién inscrito. Quien lo
          aplace puede subirlo luego desde la ficha del evento. */}
      <ComprobantePagoModal
        isOpen={Boolean(pagoPendiente)}
        onClose={() => setPagoPendiente(null)}
        evento={{
          nombre: pagoPendiente?.evento?.nombre_evento,
          costo: pagoPendiente?.evento?.costo,
          instrucciones_pago: pagoPendiente?.evento?.instrucciones_pago,
        }}
        qrToken={pagoPendiente?.qrToken}
        recienInscrito
        onSaved={() => {
          setPagoPendiente(null);
          toast.success('Comprobante enviado. Lo validaremos antes del evento.', { theme: 'dark' });
        }}
      />

      <TallaModal
        isOpen={showTallaModal}
        onClose={() => setShowTallaModal(false)}
        titulo={selectedEventForRegistration?.nombre_evento}
        loading={isSubmitting}
        onConfirm={(talla) => handleMemberRegistration(selectedEventForRegistration, talla)}
      />
    </div>
  );
}

// El Suspense es por `useSearchParams`, que obliga a un límite de suspensión.
export default function EventosClient({ eventosIniciales }) {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen text="Cargando eventos..." />}>
      <EventosContent eventosIniciales={eventosIniciales} />
    </Suspense>
  );
}