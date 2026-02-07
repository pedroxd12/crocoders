// src/app/eventos/[id]/page.jsx
'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useParams, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-toastify';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/LoadingSpinner';
import { 
  Calendar, Users, Clock, ArrowLeft, CheckCircle, XCircle, UserPlus, 
  LogIn, AlertTriangle, DollarSign, Loader, Info, Tag, BookOpen, Building, PartyPopper, QrCode, Trash2, Plus,
  Eye as EyeIcon, Shield, MapPin, Globe, ExternalLink
} from 'lucide-react';

async function sendEventRegistrationEmail(email, name, eventDetails, qrToken) {
  try {
    const response = await fetch('/api/confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, eventDetails, qrToken }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Error al enviar correo');
  } catch (error) {
    console.error('Error al enviar correo de confirmación:', error);
  }
}

function EventoDetalleContent() {
  const { id } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  
  const [evento, setEvento] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isRegistered, setIsRegistered] = useState(false);
  const [qrToken, setQrToken] = useState(null);
  const [registrationCheckLoading, setRegistrationCheckLoading] = useState(true);

  // Modals
  const [showRegistrationTypeModal, setShowRegistrationTypeModal] = useState(false);
  const [showGuestFormModal, setShowGuestFormModal] = useState(false);
  const [showTeamFormModal, setShowTeamFormModal] = useState(false);
  const [showUnregisterModal, setShowUnregisterModal] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  // Status & Actions
  const [actionLoading, setActionLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState({ show: false, message: '', type: 'invitado' });
  const [selectedImageUrl, setSelectedImageUrl] = useState('');

  // Forms Data
  const [guestData, setGuestData] = useState({
    nombre_completo: '',
    correo_electronico: '',
    numero_telefono: '',
    semestre: '',
    carrera: '',
    escuela_institucion: ''
  });
  
  const [teamData, setTeamData] = useState({
    nombre: '',
    integrantes: [{ nombre: '', email: '', telefono: '', institucion: '', carrera: '', semestre: '', es_capitan: true }],
    asesor: { nombre: '', email: '', telefono: '', institucion: '' }
  });

  const [formErrors, setFormErrors] = useState({});

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
      
      // Verificar si el registro está cerrado basándose en fecha_limite_registro
      let registroCerrado = false;
      if (data.fecha_limite_registro) {
        const fechaLimiteRegistro = new Date(data.fecha_limite_registro);
        registroCerrado = now > fechaLimiteRegistro;
      }
      
      // Verificar si el evento ya finalizó (para mostrar badge "Finalizado")
      // Usar fecha_fin si existe, si no usar fecha_inicio
      const fechaFinEvento = data.fecha_fin || data.fecha;
      // Agregar 'T00:00:00' para asegurar que se interprete en timezone local
      const eventEndDate = new Date(fechaFinEvento + 'T00:00:00');
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
        registroCerrado: registroCerrado, // Nueva propiedad para controlar inscripciones
        tipo_evento_display: data.tipo ? data.tipo.charAt(0).toUpperCase() + data.tipo.slice(1) : 'General'
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
        // Silencioso
      } else {
        const data = await res.json();
        setIsRegistered(data.registered);
        if (data.registered && data.qrToken) {
            setQrToken(data.qrToken);
        }
      }
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

  const handleApiRegistration = async (type, payload = {}) => {
    setActionLoading(true);
    const endpoint = type === 'unregister' ? '/api/eventos/unregister' : '/api/eventos/register';
    
    // Preparar userId
    let userIdToUse = user?.id_miembro;
    if (type === 'register' && !isAuthenticated && !payload.equipo) {
        // Invitado individual
        // (Se maneja en el bloque try/catch con llamada previa a /api/invitados si fuese necesario, 
        // pero ahora el backend soporta creación inline en registro de equipo, 
        // para individual invitado seguimos usand la lógica anterior o unificada).
        // Si es guest individual, enviamos datos de guest
    }

    try {
      let requestBody = { eventoId: evento.id_evento, tipo: isAuthenticated ? 'miembro' : 'invitado', userId: userIdToUse };
      
      // Lógica específica por tipo
      if (type === 'register_team') {
          requestBody = {
              eventoId: evento.id_evento,
              tipo: 'equipo',
              equipo: payload.equipo,
              integrantes: payload.integrantes,
              asesor: payload.asesor
          };
      } else if (type === 'register' && !isAuthenticated) {
         // Registro Invitado Individual
         const guestRes = await fetch('/api/invitados', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload.guestData),
         });
         const guestResult = await guestRes.json();
         if (!guestRes.ok) throw new Error(guestResult.error || 'Error al procesar datos de invitado');
         requestBody.userId = guestResult.id_invitado;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Error en ${type}`);
      
      // Éxito
      setIsRegistered(type !== 'unregister'); 
      if (result.event) {
        setEvento(prev => ({...prev, ...result.event})); 
      }
      if (result.qrToken) {
        setQrToken(result.qrToken);
      }
      
      const successType = isAuthenticated ? 'miembro' : 'invitado';
      const isCancellation = type === 'unregister';
      
      setShowSuccessModal({ 
        show: true, 
        message: isCancellation ? 'Inscripción cancelada correctamente.' : 'Te has inscrito correctamente.', 
        title: isCancellation ? 'Cancelación Exitosa' : '¡Registro Exitoso!',
        type: successType,
        isCancellation // Flag para UI condicional (icono, texto extra)
      });
      
      // Cerrar modales
      setShowRegistrationTypeModal(false);
      setShowGuestFormModal(false);
      setShowTeamFormModal(false);
      setShowUnregisterModal(false);

      // Enviar correo (simplificado) - Solo si no es unregister
      if (!isCancellation) {
         sendEventRegistrationEmail(
            isAuthenticated ? user.correo_electronico : (payload.guestData?.correo_electronico || payload.integrantes?.[0]?.email),
            isAuthenticated ? user.nombre_completo : (payload.guestData?.nombre_completo || payload.integrantes?.[0]?.nombre),
            result.event || evento,
            result.qrToken
         );
      }

    } catch (error) {
      toast.error(`Error: ${error.message}`, { theme: "dark" });
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleParticipateFlow = () => {
    if (isRegistered) {
      setShowUnregisterModal(true);
    } else if (evento.registroCerrado) {
      toast.info('El periodo de inscripción para este evento ha finalizado.', { theme: "dark" });
    } else if (evento.permite_equipos) {
      // Flujo de Equipos
      // Pre-llenar datos del capitán si está autenticado
      if (isAuthenticated && teamData.integrantes[0].nombre === '') {
          const newTeam = {...teamData};
          newTeam.integrantes[0] = {
              nombre: user.nombre_completo || '',
              email: user.correo_electronico || '',
              telefono: user.numero_telefono || '',
              // Dejar vacío si no tenemos el dato exacto, evitar autocompletado incorrecto
              institucion: user.escuela_institucion || '',
              carrera: user.carrera || '',
              semestre: user.semestre?.toString() || '',
              es_capitan: true,
              es_miembro: true
          };
          setTeamData(newTeam);
      }
      setShowTeamFormModal(true);
    } else if (isAuthenticated) {
      handleApiRegistration('register');
    } else {
      setShowRegistrationTypeModal(true);
    }
  };

  // --- Handlers para Equipos ---
  const addTeamMember = () => {
    const maxMembers = evento.max_integrantes_equipo || 5; 
    if (teamData.integrantes.length >= maxMembers) {
        toast.info(`El equipo ya tiene el máximo de ${maxMembers} integrantes.`);
        return;
    }
    setTeamData({
        ...teamData,
        integrantes: [...teamData.integrantes, { nombre: '', email: '', telefono: '', institucion: '', carrera: '', semestre: '', es_capitan: false }]
    });
  };

  const removeTeamMember = (index) => {
    // Check against dynamic minimum if available, otherwise 1
    const minCount = evento.min_integrantes_equipo || 1;
    if (teamData.integrantes.length <= minCount) {
        toast.info(minCount > 1 
            ? `Este evento requiere equipos de al menos ${minCount} estudiantes.` 
            : "Debes tener al menos un integrante.");
        return;
    }
    const newIntegrantes = [...teamData.integrantes];
    newIntegrantes.splice(index, 1);
    setTeamData({ ...teamData, integrantes: newIntegrantes });
  };
 
  const updateTeamMember = (index, field, value) => {
    const newIntegrantes = [...teamData.integrantes];
    newIntegrantes[index] = { ...newIntegrantes[index], [field]: value };
    setTeamData({ ...teamData, integrantes: newIntegrantes });
  };
  
  // Validaciones extra antes de enviar
  const handleTeamSubmit = (e) => {
    e.preventDefault();
    const minMembers = evento.min_integrantes_equipo || 1;
    if (teamData.integrantes.length < minMembers) {
        toast.warning(`Debes registrar al menos ${minMembers} integrantes.`);
        return;
    }

    // Verificar campos vacíos en integrantes
    const missingInfo = teamData.integrantes.some((m, i) => !m.nombre || !m.email); 
    if (missingInfo) {
        toast.error("Por favor completa Nombre y Email de todos los integrantes.");
        return;
    }
    
    // Si se requiere asesor, verificar que esta completo (el HTML required lo hace, pero doble check no duele)
    if (evento.requiere_asesor && (!teamData.asesor.nombre || !teamData.asesor.email)) {
        toast.error("La información del asesor es obligatoria para este evento.");
        return;
    }

    handleApiRegistration('register_team', { 
        equipo: { nombre: teamData.nombre }, 
        integrantes: teamData.integrantes, 
        asesor: teamData.asesor 
    });
  };

  // --- Utils ---
  const formatTime = (timeStr) => {
    if (!timeStr) return 'N/A';
    const [hours, minutes] = timeStr.toString().split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  if (authLoading || loading) return <LoadingSpinner fullScreen text="Cargando evento..." />;
  if (error || !evento) return <div className="min-h-screen items-center justify-center flex text-red-400">Error: {error || 'Evento no encontrado'}</div>;

  const canParticipate = !evento.registroCerrado && (evento.cupos === null || evento.cupos_disponibles > 0);

  return (
    <motion.main 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
      className="min-h-screen bg-[#0f1014] text-white pb-20 font-sans"
    >
      {/* Hero Header */}
      <div className="relative h-[55vh] min-h-[500px] w-full overflow-hidden">
          <div className="absolute inset-0">
            <Image 
                src={evento.imagen_url || '/placeholder-event.jpg'} 
                alt={evento.nombre_evento} 
                fill 
                className="object-cover opacity-60 blur-sm scale-105" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f1014] via-[#0f1014]/60 to-transparent" />
          </div>

          <div className="absolute top-0 left-0 w-full p-6 z-20 pointer-events-none">
             <div className="max-w-7xl mx-auto px-6 md:px-12 pointer-events-auto">
                <button onClick={() => router.push('/eventos')} className="text-white/80 hover:text-white flex items-center bg-black/30 px-4 py-2 rounded-full backdrop-blur-md transition-all hover:bg-black/50">
                    <ArrowLeft size={18} className="mr-2" /> Regresar
                </button>
             </div>
          </div>

          <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 max-w-7xl mx-auto flex flex-col md:flex-row items-end gap-8 z-10 w-full left-1/2 -translate-x-1/2">
              <div className="relative w-48 h-64 md:w-64 md:h-80 shadow-2xl rounded-xl overflow-hidden border-4 border-[#0f1014] hidden md:block flex-shrink-0 cursor-pointer group" onClick={() => setSelectedImageUrl(evento.imagen_url) || setShowImageModal(true)}>
                  <Image src={evento.imagen_url || '/placeholder-event.jpg'} alt="Flyer" fill className="object-cover group-hover:scale-105 transition-transform duration-500"/>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                     <EyeIcon className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" size={32} />
                  </div>
              </div>

              <div className="flex-1 mb-4">
                  <div className="flex flex-wrap gap-2 mb-4">
                      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-green-500/20 text-green-400 border border-green-500/30 backdrop-blur-md">
                          {evento.tipo_evento_display}
                      </span>
                      {evento.isPastEvent && <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/30">Finalizado</span>}
                      {isRegistered && <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center"><CheckCircle size={12} className="mr-1"/> Inscrito</span>}
                  </div>
                  
                  <h1 className="text-4xl md:text-6xl font-black mb-4 leading-tight tracking-tight text-white drop-shadow-xl">
                      {evento.nombre_evento}
                  </h1>

                  <div className="flex flex-wrap gap-x-8 gap-y-4 text-gray-300 text-sm md:text-base font-medium">
                      <div className="flex items-center gap-2"><Calendar className="text-green-400" size={20}/> {new Date(evento.fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                      <div className="flex items-center gap-2"><Clock className="text-blue-400" size={20}/> {formatTime(evento.hora_inicio)} - {formatTime(evento.hora_fin)}</div>
                      <div className="flex items-center gap-2"><MapPin className="text-red-400" size={20}/> {evento.ubicacion || 'Por definir'}</div>
                  </div>
              </div>
          </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
              {/* Image Mobile */}
              <div className="block md:hidden rounded-xl overflow-hidden shadow-2xl relative h-64 border border-gray-800" onClick={() => setSelectedImageUrl(evento.imagen_url) || setShowImageModal(true)}>
                  <Image src={evento.imagen_url || '/placeholder-event.jpg'} alt="Flyer" fill className="object-cover"/>
              </div>

              <div className="bg-[#181a20] p-6 md:p-8 rounded-2xl border border-gray-800 shadow-xl">
                  <h3 className="text-2xl font-bold mb-6 flex items-center text-gray-100">
                      <BookOpen className="mr-3 text-purple-400" /> Sobre el evento
                  </h3>
                  <div 
                    className="prose prose-invert prose-lg max-w-none prose-p:text-gray-400 prose-headings:text-gray-200 prose-a:text-green-400 hover:prose-a:text-green-300 prose-strong:text-white"
                    dangerouslySetInnerHTML={{ __html: evento.descripcion || '<p>Sin descripción disponible.</p>' }}
                  />
              </div>

              {/* Requirements/Details Grid - Minimalist Redesign */}
              {evento.id_concurso && (
                   <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-8">
                        {/* Participación */}
                        <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 flex flex-col justify-center items-center text-center hover:bg-zinc-900 transition-colors">
                            <Users className="text-gray-400 mb-2 h-6 w-6" strokeWidth={1.5} />
                            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Equipo</span>
                            <span className="text-gray-200 font-medium text-sm">
                                {evento.modalidad === 'equipos' 
                                    ? `${evento.min_integrantes_equipo || 2} - ${evento.max_integrantes_equipo} pax` 
                                    : 'Individual'}
                            </span>
                        </div>

                        {/* Requerimientos - Asesor */}
                        <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 flex flex-col justify-center items-center text-center hover:bg-zinc-900 transition-colors">
                            <Shield className={`mb-2 h-6 w-6 ${evento.requiere_asesor ? 'text-orange-400' : 'text-gray-400'}`} strokeWidth={1.5} />
                            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Asesor</span>
                            <span className={`font-medium text-sm ${evento.requiere_asesor ? 'text-orange-300' : 'text-gray-200'}`}>
                                {evento.requiere_asesor ? 'Requerido' : 'Opcional'}
                            </span>
                        </div>

                        {/* Plataforma CTA */}
                        {evento.url_concurso ? (
                            <a 
                                href={evento.url_concurso} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="col-span-2 md:col-span-1 bg-blue-600/10 p-4 rounded-2xl border border-blue-500/20 flex flex-col justify-center items-center text-center group hover:bg-blue-600/20 transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Globe className="text-blue-400 h-5 w-5 group-hover:scale-110 transition-transform" />
                                    <ExternalLink className="text-blue-500 h-3 w-3" />
                                </div>
                                <span className="text-xs text-blue-300/80 uppercase tracking-wider font-semibold mb-1">Concurso</span>
                                <span className="text-blue-100 font-bold text-sm group-hover:text-white transition-colors">
                                    Ir a la Plataforma
                                </span>
                            </a>
                        ) : (
                             <div className="col-span-2 md:col-span-1 bg-zinc-900/50 p-4 rounded-2xl border border-white/5 flex flex-col justify-center items-center text-center opacity-50">
                                <Globe className="text-gray-500 mb-2 h-6 w-6" strokeWidth={1.5} />
                                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Plataforma</span>
                                <span className="text-gray-400 text-sm">No especificada</span>
                            </div>
                        )}
                   </div>
              )}
          </div>

          {/* Sidebar / Actions */}
          <div className="lg:col-span-1 space-y-6">
              <div className="bg-[#181a20] p-6 rounded-2xl border border-gray-800 shadow-xl sticky top-24">
                   {/* Payment Status Section - Fixed */}
                   {evento.tiene_costo && (
                        <div className="mb-6 p-4 rounded-xl bg-gray-900/50 border border-gray-700">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-gray-400 text-sm">Costo de inscripción</span>
                                <span className="text-xl font-bold text-white">${evento.costo}</span>
                            </div>
                            
                            {isRegistered ? (
                                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                                    <AlertTriangle size={16}/>
                                    <span>Pago pendiente de verificación</span>
                                </div>
                            ) : (
                                <div className="text-xs text-gray-500 mt-1">
                                    * El pago se realiza después de la inscripción.
                                </div>
                            )}
                        </div>
                   )}

                   <div className="mb-6 pb-6 border-b border-gray-700">
                       <div className="flex justify-between items-center mb-2">
                           <span className="text-gray-400 font-medium h-6">Cupos disponibles</span>
                           <span className={`font-bold text-xl ${evento.cupos_disponibles > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {evento.cupos_disponibles !== null ? evento.cupos_disponibles : '∞'}
                           </span>
                       </div>
                       {evento.cupos && (
                           <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                               <div 
                                 className="bg-green-500 h-full" 
                                 style={{ width: `${Math.max(0, Math.min(100, (evento.cupos_disponibles / evento.cupos) * 100))}%` }}
                               />
                           </div>
                       )}
                   </div>

                   <div className="mb-6">
                        {!evento.tiene_costo && (
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-gray-300">Costo de entrada</span>
                                <span className="text-2xl font-bold text-white">GRATIS</span>
                            </div>
                        )}
                   </div>

                   <Button 
                        onClick={handleParticipateFlow} 
                        variant={isRegistered ? 'danger' : 'primary'} 
                        disabled={actionLoading || (!canParticipate && !isRegistered)}
                        className="w-full py-4 text-lg font-bold shadow-lg shadow-green-900/20 mb-3"
                    >
                        {isRegistered 
                          ? 'Cancelar Inscripción' 
                          : evento.registroCerrado 
                            ? 'Inscripciones Cerradas' 
                            : !canParticipate 
                              ? 'Cupos Agotados' 
                              : evento.permite_equipos 
                                ? 'Inscribir Equipo' 
                                : 'Inscribirme Ahora'}
                    </Button>

                    {isRegistered && (
                        <Button onClick={() => setShowTicketModal(true)} variant="secondary" className="w-full py-3 flex items-center justify-center">
                            <QrCode className="mr-2" size={18}/> Ver Ticket de Acceso
                        </Button>
                    )}

                   <div className="mt-6 pt-6 border-t border-gray-700 text-center">
                       <p className="text-xs text-gray-500">
                           ¿Tienes dudas? Contacta a los administradores del club.
                       </p>
                   </div>
              </div>
          </div>
      </div>
      
      {/* ... Modals mantenidos igual ... */}
      
      {/* Modal Equipos */}
      <Modal isOpen={showTeamFormModal} onClose={() => setShowTeamFormModal(false)} title="Registro de Equipo" size="2xl">
         <form onSubmit={handleTeamSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
            <div className="space-y-4">
                <h3 className="text-green-400 font-bold border-b border-gray-700 pb-2">Datos del Equipo</h3>
                <Input label="Nombre del Equipo *" value={teamData.nombre} onChange={e => setTeamData({...teamData, nombre: e.target.value})} required className="bg-gray-700"/>
                
                <div className="space-y-3 bg-gray-700/30 p-4 rounded-xl border border-gray-600">
                    <h4 className="text-sm font-bold text-gray-300">
                        Datos del Asesor {evento.requiere_asesor ? <span className="text-red-400">*</span> : <span className="text-gray-500 font-normal">(Opcional)</span>}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input label={`Nombre ${evento.requiere_asesor ? '*' : ''}`} value={teamData.asesor.nombre} onChange={e => setTeamData({...teamData, asesor: {...teamData.asesor, nombre: e.target.value}})} required={evento.requiere_asesor} className="bg-gray-700"/>
                        <Input label={`Email ${evento.requiere_asesor ? '*' : ''}`} type="email" value={teamData.asesor.email} onChange={e => setTeamData({...teamData, asesor: {...teamData.asesor, email: e.target.value}})} required={evento.requiere_asesor} className="bg-gray-700"/>
                        <Input label={`Teléfono ${evento.requiere_asesor ? '*' : ''}`} value={teamData.asesor.telefono} onChange={e => setTeamData({...teamData, asesor: {...teamData.asesor, telefono: e.target.value}})} required={evento.requiere_asesor} className="bg-gray-700"/>
                        <Input label={`Institución ${evento.requiere_asesor ? '*' : ''}`} value={teamData.asesor.institucion} onChange={e => setTeamData({...teamData, asesor: {...teamData.asesor, institucion: e.target.value}})} required={evento.requiere_asesor} className="bg-gray-700"/>
                    </div>
                </div>
                
                <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                        <h3 className="text-green-400 font-bold">
                            Integrantes del Equipo <span className="text-gray-400 text-sm font-normal ml-2">(1 - {evento.max_integrantes_equipo || 5} miembros)</span>
                        </h3>
                        <Button type="button" size="sm" onClick={addTeamMember} disabled={teamData.integrantes.length >= (evento.max_integrantes_equipo || 5)} variant="secondary">
                            <Plus size={14} className="mr-1"/> Agregar Integrante ({teamData.integrantes.length}/{evento.max_integrantes_equipo || 5})
                        </Button>
                    </div>
                    
                    {teamData.integrantes.map((member, idx) => (
                        <div key={idx} className="bg-gray-700/50 p-4 rounded-xl border border-gray-600 relative">
                            {idx > 0 && (
                                <button type="button" onClick={() => removeTeamMember(idx)} className="absolute top-2 right-2 text-red-400 hover:text-red-300">
                                    <Trash2 size={16}/>
                                </button>
                            )}
                            <h4 className="text-xs uppercase font-bold text-gray-400 mb-2">Integrante {idx + 1} {idx === 0 ? '(Capitán)' : ''}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input label="Email *" type="email" value={member.email} onChange={e => updateTeamMember(idx, 'email', e.target.value)} required placeholder="Correo personal o institucional" className="bg-gray-700 text-sm"/>
                                <Input label="Nombre *" value={member.nombre} onChange={e => updateTeamMember(idx, 'nombre', e.target.value)} required className="bg-gray-700 text-sm"/>
                                <div className="md:col-span-2">
                                    <p className="text-xs text-blue-300 mb-2">* Si el integrante es miembro del club, asegúrese de usar su correo registrado para vincular su cuenta automáticamente.</p>
                                </div>
                                {/* Campos extendidos para invitados/no detectados (siempre pedirlos para asegurar datos) */}
                                <Input label="Teléfono" value={member.telefono} onChange={e => updateTeamMember(idx, 'telefono', e.target.value)} required className="bg-gray-700 text-sm"/>
                                <Input label="Institución" value={member.institucion} onChange={e => updateTeamMember(idx, 'institucion', e.target.value)} required className="bg-gray-700 text-sm"/>
                                <Input label="Carrera/Bachillerato" value={member.carrera} onChange={e => updateTeamMember(idx, 'carrera', e.target.value)} required className="bg-gray-700 text-sm"/>
                             </div>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="flex justify-end pt-4 gap-3">
                <Button type="button" onClick={() => setShowTeamFormModal(false)} variant="secondary">Cancelar</Button>
                <Button type="submit" loading={actionLoading}>Registrar Equipo</Button>
            </div>
         </form>
      </Modal>

      {/* Modal Ticket QR */}
      <Modal isOpen={showTicketModal} onClose={() => setShowTicketModal(false)} title="Mi Ticket de Acceso" size="sm">
          <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl">
              <h3 className="text-black font-bold mb-4 text-lg">{evento.nombre_evento}</h3>
              {/* QR Code generado dinámicamente con token seguro si existe, fallback a legacy JSON */}
              <div className="border-4 border-black p-2">
                <Image 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrToken || JSON.stringify({eventId: evento.id_evento, userId: user?.id_miembro, date: new Date().toISOString()}))}`} 
                    alt="QR Code" 
                    width={200} 
                    height={200}
                    unoptimized
                />
              </div>
              <p className="text-black text-sm mt-4 text-center">Presenta este código al ingresar al evento.</p>
          </div>
      </Modal>

      {/* Modal Tipo de Registro (Invitado vs Miembro) */}
      <Modal isOpen={showRegistrationTypeModal} onClose={() => setShowRegistrationTypeModal(false)} title="Confirmar Inscripción">
        <div className="space-y-3">
          <Button onClick={() => router.push(`/iniciar?redirect=${encodeURIComponent(pathname)}`)} variant="primary" className="w-full flex justify-center"><LogIn className="mr-2"/>Soy miembro (Iniciar sesión)</Button>
          <Button onClick={() => { setShowRegistrationTypeModal(false); setShowGuestFormModal(true); }} variant="secondary" className="w-full flex justify-center"><UserPlus className="mr-2"/>Soy invitado</Button>
        </div>
      </Modal>

      {/* Formulario Invitado (simplificado) */}
      <Modal isOpen={showGuestFormModal} onClose={() => setShowGuestFormModal(false)} title="Registro Invitado">
          <form onSubmit={(e) => { e.preventDefault(); handleApiRegistration('register', { guestData }); }} className="space-y-3">
             <Input label="Nombre *" value={guestData.nombre_completo} onChange={e => setGuestData({...guestData, nombre_completo: e.target.value})} required className="bg-gray-700"/>
             <Input label="Email *" type="email" value={guestData.correo_electronico} onChange={e => setGuestData({...guestData, correo_electronico: e.target.value})} required className="bg-gray-700"/>
             <Input label="Teléfono *" value={guestData.numero_telefono} onChange={e => setGuestData({...guestData, numero_telefono: e.target.value})} required className="bg-gray-700"/>
             <Input label="Escuela/Institución *" value={guestData.escuela_institucion} onChange={e => setGuestData({...guestData, escuela_institucion: e.target.value})} required className="bg-gray-700"/>
             <Input label="Carrera *" value={guestData.carrera} onChange={e => setGuestData({...guestData, carrera: e.target.value})} required className="bg-gray-700"/>
             <Button type="submit" loading={actionLoading} className="w-full mt-4">Confirmar</Button>
          </form>
      </Modal>

      {/* Modal Éxito / Confirmación */}
      <AnimatePresence>
        {showSuccessModal.show && (
            <Modal isOpen={showSuccessModal.show} onClose={() => setShowSuccessModal({show: false})} title={showSuccessModal.title || "Notificación"}>
                <div className="text-center p-4">
                    {showSuccessModal.isCancellation ? (
                        <Trash2 size={50} className="text-red-400 mx-auto mb-4"/>
                    ) : (
                        <PartyPopper size={50} className="text-green-400 mx-auto mb-4 animate-bounce"/>
                    )}
                    <p className="text-white text-lg">{showSuccessModal.message}</p>
                    {!showSuccessModal.isCancellation && (
                        <p className="text-gray-400 mt-2">Revisa tu correo para más detalles.</p>
                    )}
                    <Button onClick={() => setShowSuccessModal({show: false})} className="mt-6 w-full">Entendido</Button>
                </div>
            </Modal>
        )}
      </AnimatePresence>
       
       <Modal isOpen={showUnregisterModal} onClose={() => setShowUnregisterModal(false)} title="Cancelar Inscripción">
          <p className="text-white mb-4">¿Seguro que deseas cancelar tu registro?</p>
          <div className="flex justify-end gap-3">
             <Button onClick={() => setShowUnregisterModal(false)} variant="secondary">No</Button>
             <Button onClick={() => handleApiRegistration('unregister')} variant="danger" loading={actionLoading}>Sí, cancelar</Button>
          </div>
       </Modal>
       
       <Modal isOpen={showImageModal} onClose={() => setShowImageModal(false)} title="Vista Previa">
          <div className="relative h-[80vh] w-full">
            <Image src={selectedImageUrl} alt="Preview" fill className="object-contain" />
          </div>
       </Modal>

    </motion.main>
  );
}

const InfoCard = ({ icon, title, children }) => (
  <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600 shadow-lg">
    <h3 className="text-green-300 font-semibold mb-1 flex items-center gap-2">{icon} {title}</h3>
    <div className="text-white text-lg">{children}</div>
  </div>
);

export default function EventoDetallePage() {
    return (
      <Suspense fallback={<LoadingSpinner fullScreen text="Cargando evento..." />}>
        <EventoDetalleContent />
      </Suspense>
    );
}
