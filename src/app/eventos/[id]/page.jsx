// src/app/eventos/[id]/page.jsx
'use client';
import { useEffect, useMemo, useState, useCallback, Suspense } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-toastify';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'isomorphic-dompurify';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/LoadingSpinner';
import EventoImagenes from '@/components/EventoImagenes';
import { formatearFechaLarga, formatearHora, aDiaISO, combinarFechaHora } from '@/lib/fechas';
import {
  Calendar, Users, Clock, ArrowLeft, CheckCircle, UserPlus,
  LogIn, AlertTriangle, Loader, BookOpen, PartyPopper, QrCode, Trash2, Plus,
  Eye as EyeIcon, Shield, MapPin, Globe, ExternalLink
} from 'lucide-react';

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

function EventoDetalleContent() {
  const { id } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  
  const [evento, setEvento] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isRegistered, setIsRegistered] = useState(false);
  const [qrToken, setQrToken] = useState(null);
  // Imagen del QR (data URL) generada por nuestro propio backend.
  const [qrImage, setQrImage] = useState(null);
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

  // ¿Este evento se inscribe por equipos?
  // `permite_equipos` viene del CATÁLOGO de tipo de evento; por sí solo no
  // significa que este evento concreto sea por equipos. Hacen falta las tres
  // condiciones: que el tipo lo permita, que el evento tenga concurso y que el
  // admin haya elegido modalidad "equipos". Sin esto, un concurso individual
  // mostraba "Inscribir Equipo" sin ninguna vía de inscripción individual, y un
  // evento sin concurso llevaba a un modal cuyo envío siempre fallaba con
  // "Configuración de concurso no encontrada".
  const esRegistroPorEquipos = Boolean(
    evento?.permite_equipos && evento?.id_concurso && evento?.modalidad === 'equipos'
  );

  // Rango de integrantes real del concurso, en un solo sitio. Antes había tres
  // valores por defecto distintos (1, 2 y 5) repartidos por el archivo, así que
  // el modal anunciaba un mínimo y la validación exigía otro.
  const minEq = Number(evento?.min_integrantes_equipo) || 1;
  const maxEq = Number(evento?.max_integrantes_equipo) || null;

  const sanitizedDescripcion = useMemo(() => {
    const html = evento?.descripcion || '<p>Sin descripción disponible.</p>';
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'span', 'div'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
      ALLOW_DATA_ATTR: false,
    });
  }, [evento?.descripcion]);

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

      // La REGLA de cierre vive en el servidor (src/lib/eventos-fechas.js): es
      // la fecha límite o, si no hay, una hora antes del inicio, siempre en la
      // zona del club. `/api/eventos/[id]` ya devuelve el veredicto calculado
      // en SQL, así que aquí sólo se consume. Recalcularlo en el navegador era
      // lo que hacía que el botón dijera "Inscribirme Ahora" y el POST
      // respondiera 400: el cliente sólo miraba `fecha_limite_registro` y
      // desconocía el margen de una hora.
      //
      // El cálculo local queda como respaldo por si la respuesta viene de una
      // versión anterior del API (o de la caché del navegador) sin las banderas.
      const eventEndDate = combinarFechaHora(data.fecha_fin || data.fecha, data.hora_fin, { finDelDia: true });
      const terminadoLocal = eventEndDate ? eventEndDate < now : false;
      const cerradoLocal = data.fecha_limite_registro
        ? now > new Date(data.fecha_limite_registro)
        : false;

      setEvento({
        ...data,
        fecha: aDiaISO(data.fecha),
        isPastEvent: typeof data.evento_terminado === 'boolean' ? data.evento_terminado : terminadoLocal,
        registroCerrado: typeof data.registro_cerrado === 'boolean' ? data.registro_cerrado : cerradoLocal,
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

  // El QR se pide a nuestro backend al abrir el ticket. Antes la imagen venía
  // de api.qrserver.com con el token del ticket en la URL, es decir se le
  // entregaba un credencial de acceso a un servicio de terceros.
  const abrirTicket = useCallback(async () => {
    setShowTicketModal(true);
    if (!qrToken) return;

    try {
      const res = await fetch('/api/eventos/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrToken }),
      });
      if (!res.ok) return;
      const data = await res.json();
      // Se guarda junto al token que lo generó: si el token cambia, la imagen
      // vieja deja de considerarse válida sin necesidad de limpiarla aparte.
      if (data.dataUrl) setQrImage({ token: qrToken, dataUrl: data.dataUrl });
    } catch {
      // Sin imagen: el modal muestra el aviso de que se está generando.
    }
  }, [qrToken]);

  const qrImageSrc = qrImage?.token === qrToken ? qrImage.dataUrl : null;

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

    try {
      let requestBody = {
        eventoId: evento.id_evento,
        tipo: isAuthenticated ? 'miembro' : 'invitado',
        userId: user?.id_miembro,
      };

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
         // Registro Invitado Individual.
         // Los campos vacíos NO se envían: el esquema de `/api/invitados` los
         // valida con zod y una cadena vacía en `semestre` se convierte en 0,
         // que no pasa el mínimo y devolvía un 400 antes de crear al invitado.
         const datosInvitado = Object.fromEntries(
            Object.entries(payload.guestData || {}).filter(([, v]) => v !== '' && v != null),
         );
         const guestRes = await fetch('/api/invitados', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datosInvitado),
         });
         const guestResult = await guestRes.json();
         if (!guestRes.ok) throw new Error(guestResult.error || 'Error al procesar datos de invitado');
         requestBody.userId = guestResult.id_invitado;
         // `guestToken` es la credencial firmada que acredita que quien pide la
         // inscripción es quien acaba de dar de alta ese correo. Sin ella
         // /api/eventos/register rechaza SIEMPRE el registro de invitado: los
         // ids son secuenciales y aceptarlos a secas permitía inscribir (y
         // quedarse con el QR) de cualquier tercero.
         requestBody.guestToken = guestResult.guestToken;
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

      // Enviar correo (no bloquea la UI; si falla, avisa al usuario)
      if (!isCancellation) {
         sendEventRegistrationEmail(
            isAuthenticated ? user.correo_electronico : (payload.guestData?.correo_electronico || payload.integrantes?.[0]?.email),
            isAuthenticated ? user.nombre_completo : (payload.guestData?.nombre_completo || payload.integrantes?.[0]?.nombre),
            result.event || evento,
            result.qrToken
         ).catch(() => {
            toast.warning('Tu inscripción se realizó, pero no pudimos enviarte el correo de confirmación.', { theme: 'dark' });
         });
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
    } else if (evento.isPastEvent) {
      // El servidor tampoco debería aceptarlo, pero el botón llegaba a estar
      // activo y rotulado "Inscribirme Ahora" junto al badge "Finalizado".
      toast.info('Este evento ya ha finalizado.', { theme: "dark" });
    } else if (evento.registroCerrado) {
      toast.info('El periodo de inscripción para este evento ha finalizado.', { theme: "dark" });
    } else if (esRegistroPorEquipos) {
      // Flujo de Equipos
      const nuevosIntegrantes = [...teamData.integrantes];

      // Pre-llenar datos del capitán si está autenticado
      if (isAuthenticated && nuevosIntegrantes[0].nombre === '') {
          nuevosIntegrantes[0] = {
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
      }

      // El equipo arranca ya con el mínimo de filas exigido. Antes abría con
      // una sola y al enviar saltaba "Debes registrar al menos 2 integrantes".
      while (nuevosIntegrantes.length < minEq) {
          nuevosIntegrantes.push({ nombre: '', email: '', telefono: '', institucion: '', carrera: '', semestre: '', es_capitan: false });
      }

      setTeamData({ ...teamData, integrantes: nuevosIntegrantes });
      setShowTeamFormModal(true);
    } else if (isAuthenticated) {
      handleApiRegistration('register');
    } else {
      setShowRegistrationTypeModal(true);
    }
  };

  // --- Handlers para Equipos ---
  const addTeamMember = () => {
    if (maxEq && teamData.integrantes.length >= maxEq) {
        toast.info(`El equipo ya tiene el máximo de ${maxEq} integrantes.`);
        return;
    }
    setTeamData({
        ...teamData,
        integrantes: [...teamData.integrantes, { nombre: '', email: '', telefono: '', institucion: '', carrera: '', semestre: '', es_capitan: false }]
    });
  };

  const removeTeamMember = (index) => {
    if (teamData.integrantes.length <= minEq) {
        toast.info(minEq > 1
            ? `Este evento requiere equipos de al menos ${minEq} integrantes.`
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
    if (teamData.integrantes.length < minEq) {
        toast.warning(`Debes registrar al menos ${minEq} integrantes.`);
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

  if (authLoading || loading) return <LoadingSpinner fullScreen text="Cargando evento..." />;
  if (error || !evento) return <div className="min-h-screen items-center justify-center flex text-red-400">Error: {error || 'Evento no encontrado'}</div>;

  // `isPastEvent` entra en la condición: hasta ahora sólo servía para pintar el
  // badge "Finalizado" y el botón seguía activo, así que se podía uno inscribir
  // a un evento terminado y recibir por correo el QR de acceso.
  const canParticipate =
    !evento.isPastEvent && !evento.registroCerrado && (evento.cupos === null || evento.cupos_disponibles > 0);

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
                sizes="100vw"
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
              <div className="relative w-48 h-64 md:w-64 md:h-80 shadow-2xl rounded-xl overflow-hidden border-4 border-[#0f1014] hidden md:block flex-shrink-0 cursor-pointer group" onClick={() => { setSelectedImageUrl(evento.imagen_url || '/placeholder-event.jpg'); setShowImageModal(true); }}>
                  <Image src={evento.imagen_url || '/placeholder-event.jpg'} alt="Flyer" fill sizes="256px" className="object-cover group-hover:scale-105 transition-transform duration-500"/>
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
                      <div className="flex items-center gap-2"><Calendar className="text-green-400" size={20}/> {formatearFechaLarga(evento.fecha)}</div>
                      <div className="flex items-center gap-2"><Clock className="text-blue-400" size={20}/> {formatearHora(evento.hora_inicio)} – {formatearHora(evento.hora_fin)}</div>
                      <div className="flex items-center gap-2"><MapPin className="text-red-400" size={20}/> {evento.ubicacion || 'Por definir'}</div>
                  </div>
              </div>
          </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
              {/* Image Mobile */}
              <div className="block md:hidden rounded-xl overflow-hidden shadow-2xl relative h-64 border border-line" onClick={() => { setSelectedImageUrl(evento.imagen_url || '/placeholder-event.jpg'); setShowImageModal(true); }}>
                  <Image src={evento.imagen_url || '/placeholder-event.jpg'} alt="Flyer" fill sizes="100vw" className="object-cover"/>
              </div>

              <div className="bg-surface p-6 md:p-8 rounded-2xl border border-line shadow-xl">
                  <h2 className="text-2xl font-bold mb-6 flex items-center text-fg">
                      <BookOpen className="mr-3 text-purple-400" /> Sobre el evento
                  </h2>
                  <div
                    className="prose prose-invert prose-lg max-w-none prose-p:text-gray-400 prose-headings:text-gray-200 prose-a:text-green-400 hover:prose-a:text-green-300 prose-strong:text-white"
                    dangerouslySetInnerHTML={{ __html: sanitizedDescripcion }}
                  />
              </div>

              {/* Galería de fotos del evento. El componente ya existía y su
                  endpoint respondía, pero no estaba montado en ninguna ruta:
                  las evidencias públicas no se veían en ningún sitio. No pinta
                  nada si el evento aún no tiene fotos. */}
              <EventoImagenes eventoId={id} />

              {/* Requirements/Details Grid - Minimalist Redesign */}
              {evento.id_concurso && (
                   <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-8">
                        {/* Participación */}
                        <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 flex flex-col justify-center items-center text-center hover:bg-zinc-900 transition-colors">
                            <Users className="text-gray-400 mb-2 h-6 w-6" strokeWidth={1.5} />
                            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Equipo</span>
                            <span className="text-gray-200 font-medium text-sm">
                                {evento.modalidad === 'equipos'
                                    ? `${minEq} - ${maxEq ?? '∞'} pax`
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
              <div className="bg-surface p-6 rounded-2xl border border-line shadow-xl sticky top-24">
                   {/* Payment Status Section - Fixed */}
                   {evento.tiene_costo && (
                        <div className="mb-6 p-4 rounded-xl bg-surface-2 border border-line">
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

                   <div className="mb-6 pb-6 border-b border-line">
                       <div className="flex justify-between items-center mb-2">
                           <span className="text-gray-400 font-medium h-6">Cupos disponibles</span>
                           <span className={`font-bold text-xl ${evento.cupos_disponibles > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {evento.cupos_disponibles !== null ? evento.cupos_disponibles : '∞'}
                           </span>
                       </div>
                       {evento.cupos && (
                           <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden">
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
                        // Mientras se comprueba si ya está inscrito, el botón no
                        // acepta clics: si no, durante ese hueco decía
                        // "Inscribirme Ahora" a alguien que ya lo estaba y el
                        // servidor respondía "Ya te encuentras registrado".
                        disabled={actionLoading || registrationCheckLoading || (!canParticipate && !isRegistered)}
                        className="w-full py-4 text-lg font-bold shadow-lg shadow-green-900/20 mb-3"
                    >
                        {isRegistered
                          ? 'Cancelar Inscripción'
                          : evento.isPastEvent
                            ? 'Evento finalizado'
                            : evento.registroCerrado
                              ? 'Inscripciones Cerradas'
                              : !canParticipate
                                ? 'Cupos Agotados'
                                : esRegistroPorEquipos
                                  ? 'Inscribir Equipo'
                                  : 'Inscribirme Ahora'}
                    </Button>

                    {isRegistered && (
                        <Button onClick={abrirTicket} variant="secondary" className="w-full py-3 flex items-center justify-center">
                            <QrCode className="mr-2" size={18}/> Ver Ticket de Acceso
                        </Button>
                    )}

                   <div className="mt-6 pt-6 border-t border-line text-center">
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
                <h3 className="text-brand font-bold border-b border-line pb-2">Datos del Equipo</h3>
                <Input label="Nombre del equipo" value={teamData.nombre} onChange={e => setTeamData({...teamData, nombre: e.target.value})} required/>
                
                <div className="space-y-3 bg-surface-2 p-4 rounded-xl border border-line">
                    <h4 className="text-sm font-bold text-gray-300">
                        Datos del Asesor {evento.requiere_asesor ? <span className="text-danger">*</span> : <span className="text-gray-500 font-normal">(Opcional)</span>}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input label="Nombre" value={teamData.asesor.nombre} onChange={e => setTeamData({...teamData, asesor: {...teamData.asesor, nombre: e.target.value}})} required={evento.requiere_asesor}/>
                        <Input label="Email" type="email" value={teamData.asesor.email} onChange={e => setTeamData({...teamData, asesor: {...teamData.asesor, email: e.target.value}})} required={evento.requiere_asesor}/>
                        <Input label="Teléfono" value={teamData.asesor.telefono} onChange={e => setTeamData({...teamData, asesor: {...teamData.asesor, telefono: e.target.value}})} required={evento.requiere_asesor}/>
                        <Input label="Institución" value={teamData.asesor.institucion} onChange={e => setTeamData({...teamData, asesor: {...teamData.asesor, institucion: e.target.value}})} required={evento.requiere_asesor}/>
                    </div>
                </div>
                
                <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-line pb-2">
                        <h3 className="text-brand font-bold">
                            Integrantes del Equipo <span className="text-gray-400 text-sm font-normal ml-2">({minEq} - {maxEq ?? '∞'} miembros)</span>
                        </h3>
                        <Button type="button" size="sm" onClick={addTeamMember} disabled={Boolean(maxEq) && teamData.integrantes.length >= maxEq} variant="secondary">
                            <Plus size={14} className="mr-1"/> Agregar Integrante ({teamData.integrantes.length}/{maxEq ?? '∞'})
                        </Button>
                    </div>
                    
                    {teamData.integrantes.map((member, idx) => (
                        <div key={idx} className="bg-surface-2 p-4 rounded-xl border border-line relative">
                            {idx > 0 && (
                                <button type="button" onClick={() => removeTeamMember(idx)} className="absolute top-2 right-2 text-red-400 hover:text-red-300">
                                    <Trash2 size={16}/>
                                </button>
                            )}
                            <h4 className="text-xs uppercase font-bold text-gray-400 mb-2">Integrante {idx + 1} {idx === 0 ? '(Capitán)' : ''}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input label="Email" type="email" value={member.email} onChange={e => updateTeamMember(idx, 'email', e.target.value)} required placeholder="Correo personal o institucional"/>
                                <Input label="Nombre" value={member.nombre} onChange={e => updateTeamMember(idx, 'nombre', e.target.value)} required/>
                                <div className="md:col-span-2">
                                    <p className="text-xs text-blue-300 mb-2">* Si el integrante es miembro del club, asegúrese de usar su correo registrado para vincular su cuenta automáticamente.</p>
                                </div>
                                {/* Campos extendidos: obligatorios para asegurar datos del concurso.
                                    El label lleva '*' para que la obligatoriedad sea visible (antes
                                    sólo el atributo HTML required la imponía, sin pista visual). */}
                                <Input label="Teléfono" value={member.telefono} onChange={e => updateTeamMember(idx, 'telefono', e.target.value.replace(/\D/g, '').slice(0, 15))} required placeholder="10 dígitos"/>
                                <Input label="Institución" value={member.institucion} onChange={e => updateTeamMember(idx, 'institucion', e.target.value)} required/>
                                <Input label="Carrera/Bachillerato" value={member.carrera} onChange={e => updateTeamMember(idx, 'carrera', e.target.value)} required/>
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
              {/* El QR lo genera /api/eventos/qr: el ticket firmado no sale de este origen. */}
              <div className="border-4 border-black p-2 flex items-center justify-center" style={{ minWidth: 208, minHeight: 208 }}>
                {qrImageSrc ? (
                  <Image
                      src={qrImageSrc}
                      alt="Código QR de acceso al evento"
                      width={200}
                      height={200}
                      unoptimized
                  />
                ) : (
                  <Loader className="animate-spin text-black" size={32} />
                )}
              </div>
              <p className="text-black text-sm mt-4 text-center">
                {qrImageSrc
                  ? 'Presenta este código al ingresar al evento.'
                  : 'Generando tu código de acceso…'}
              </p>
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
             <Input label="Nombre" value={guestData.nombre_completo} onChange={e => setGuestData({...guestData, nombre_completo: e.target.value})} required/>
             <Input label="Email" type="email" value={guestData.correo_electronico} onChange={e => setGuestData({...guestData, correo_electronico: e.target.value})} required/>
             <Input label="Teléfono" value={guestData.numero_telefono} onChange={e => setGuestData({...guestData, numero_telefono: e.target.value})} required/>
             <Input label="Escuela/Institución" value={guestData.escuela_institucion} onChange={e => setGuestData({...guestData, escuela_institucion: e.target.value})} required/>
             <Input label="Carrera" value={guestData.carrera} onChange={e => setGuestData({...guestData, carrera: e.target.value})} required/>
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
            <Image src={selectedImageUrl} alt="Preview" fill sizes="100vw" className="object-contain" />
          </div>
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
