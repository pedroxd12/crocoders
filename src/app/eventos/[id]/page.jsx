// src/app/eventos/[id]/page.jsx
'use client';
import { useEffect, useMemo, useState, useCallback, Suspense } from 'react';
import { useRouter, useParams, usePathname, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-toastify';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'isomorphic-dompurify';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import LoadingSpinner from '@/components/LoadingSpinner';
import EventoImagenes from '@/components/EventoImagenes';
import { EstadoBadge, CategoriaTag, estadoDeEvento, rangoEquipos } from '@/components/eventos/EventoBadges';
import {
  CamposInvitado,
  TallaModal,
  INVITADO_VACIO,
  validarInvitado,
  limpiarInvitadoPayload,
  INTEGRANTE_EQUIPO_VACIO,
  CamposInstitucionIntegrante,
  validarInstitucionIntegrantes,
  integrantesEquipoPayload,
} from '@/components/eventos/RegistroInvitado';
import ComprobantePagoModal, { EstadoPago } from '@/components/eventos/ComprobantePago';
import { TALLAS_PLAYERA, CARRERAS_ITLAC } from '@/lib/registro-campos';
import { fetcher, postFetcher } from '@/lib/fetcher';
import { formatearFechaLarga, formatearHora, aDiaISO, combinarFechaHora } from '@/lib/fechas';
import {
  Calendar, Clock, ArrowLeft, UserPlus,
  LogIn, AlertTriangle, Loader, PartyPopper, QrCode, Trash2, Plus,
  Eye as EyeIcon, MapPin, Receipt, Target
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
  const searchParams = useSearchParams();
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
  // Talla de un MIEMBRO en eventos con `solicitar_talla`: su registro es de un
  // clic, así que se le pregunta en un mini-modal antes de confirmar.
  const [showTallaModal, setShowTallaModal] = useState(false);
  // Comprobante de pago (eventos con costo). `comprobanteRecien` distingue el
  // paso que sigue al registro —donde el modal explica que el lugar quedó
  // apartado— de abrirlo más tarde desde la ficha para corregirlo.
  const [showComprobanteModal, setShowComprobanteModal] = useState(false);
  const [comprobanteRecien, setComprobanteRecien] = useState(false);
  // Desafío elegido (eventos con retos). El registro de un miembro es de un
  // clic, así que igual que con la talla se le pregunta en un mini-modal.
  const [retoSeleccionado, setRetoSeleccionado] = useState('');
  const [showRetoModal, setShowRetoModal] = useState(false);

  // Status & Actions
  const [actionLoading, setActionLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState({ show: false, message: '', type: 'invitado' });
  const [selectedImageUrl, setSelectedImageUrl] = useState('');

  // Forms Data. Los campos del invitado viven en el componente compartido
  // RegistroInvitado (el mismo del listado y de programas).
  const [guestData, setGuestData] = useState(INVITADO_VACIO);
  const [guestErrors, setGuestErrors] = useState({});

  const [teamData, setTeamData] = useState({
    nombre: '',
    // Forma de la fila compartida con el registro manual del admin
    // (RegistroInvitado.INTEGRANTE_EQUIPO_VACIO): institución elegible
    // ITLAC/otra, carrera y número de control incluidos.
    integrantes: [{ ...INTEGRANTE_EQUIPO_VACIO, es_capitan: true }],
    // Varios asesores (hasta concurso.max_asesores). Sin institución: no se
    // usa para nada y sólo alargaba el formulario. La talla sí, porque al
    // asesor también se le entrega playera cuando el evento la da.
    asesores: [{ nombre: '', email: '', telefono: '', talla_playera: '' }]
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
  // Tope de asesores del concurso (1 si el evento no lo configura).
  const maxAsesores = Math.min(5, Math.max(1, Number(evento?.max_asesores) || 1));

  // Desafíos del evento. Van por su propio endpoint (y no dentro de
  // /api/eventos/[id]) porque su ocupación cambia con cada registro: así basta
  // revalidar esta clave tras inscribirse para que los cupos por desafío se
  // actualicen sin recargar la ficha entera.
  const { data: retosData, mutate: mutarRetos } = useSWR(
    id ? `/api/eventos/${id}/retos` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const retos = useMemo(() => (Array.isArray(retosData) ? retosData : []), [retosData]);
  const hayRetos = retos.length > 0;
  // Con todos los desafíos llenos ya no cabe nadie, aunque el aforo global del
  // evento diga lo contrario.
  const retosLlenos = hayRetos && retos.every((r) => r.lleno);
  const unidadReto = esRegistroPorEquipos ? 'equipos' : 'inscripciones';

  // Etiqueta del desafío para los selectores: título + plazas restantes.
  const opcionesReto = useMemo(
    () =>
      retos.map((r) => ({
        value: String(r.id_reto),
        label:
          r.cupo_equipos === null
            ? r.titulo
            : r.lleno
              ? `${r.titulo} — sin plazas`
              : `${r.titulo} — quedan ${r.equipos_disponibles} de ${r.cupo_equipos} ${unidadReto}`,
      })),
    [retos, unidadReto],
  );

  // Preselección desde la URL (?reto=slug): es como llega quien pulsa
  // «Registrar equipo en este desafío» desde la landing del evento.
  //
  // Se DERIVA en render en vez de copiarse al estado desde un efecto: así no
  // hay un render intermedio con el desafío sin elegir (que además dispara la
  // regla de React contra los setState dentro de efectos) y, en cuanto la
  // persona toca el selector, su elección manda sobre la de la URL.
  const retoParam = searchParams.get('reto');
  const retoPorUrl = useMemo(() => {
    if (!retoParam) return '';
    const encontrado = retos.find(
      (r) => r.slug === retoParam || String(r.id_reto) === String(retoParam),
    );
    return encontrado && !encontrado.lleno ? String(encontrado.id_reto) : '';
  }, [retoParam, retos]);
  const retoElegido = retoSeleccionado || retoPorUrl;

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

  // Estado del pago: qué comprobante subió esta inscripción y qué dijo el staff.
  // Se consulta con el MISMO ticket firmado del QR, que es lo único que tiene a
  // mano un invitado sin cuenta. Va por SWR (y no por un efecto propio) porque
  // la clave cambia sola al emitirse un ticket nuevo tras inscribirse.
  const { data: estadoPago, mutate: mutarEstadoPago } = useSWR(
    qrToken && evento?.tiene_costo ? ['/api/eventos/comprobante/estado', { qrToken }] : null,
    postFetcher,
    { revalidateOnFocus: false },
  );
  const comprobante = estadoPago?.comprobante ?? null;

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

    // El desafío puede venir en el payload (lo acaba de elegir un mini-modal,
    // cuyo setState todavía no ha llegado al estado) o del estado. Se manda
    // sólo si el evento tiene retos; el servidor lo exige en ese caso.
    const idRetoElegido = payload.idReto ?? retoElegido;

    try {
      let requestBody = {
        eventoId: evento.id_evento,
        tipo: isAuthenticated ? 'miembro' : 'invitado',
        userId: user?.id_miembro,
        ...(hayRetos && idRetoElegido ? { id_reto: Number(idRetoElegido) } : {}),
      };

      // Talla del miembro (eventos con `solicitar_talla`): la eligió en el
      // mini-modal y se guarda en su ficha al confirmar la inscripción.
      if (type === 'register' && isAuthenticated && payload.tallaPlayera) {
        requestBody.talla_playera = payload.tallaPlayera;
      }

      // Lógica específica por tipo
      if (type === 'register_team') {
          requestBody = {
              eventoId: evento.id_evento,
              tipo: 'equipo',
              equipo: payload.equipo,
              integrantes: payload.integrantes,
              asesores: payload.asesores,
              ...(hayRetos && idRetoElegido ? { id_reto: Number(idRetoElegido) } : {})
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

      // Evento con costo: el registro NO termina en "¡listo!". La inscripción
      // quedó 'pendiente' y lo siguiente es el comprobante, así que se abre ese
      // paso en lugar del modal de éxito (que prometía un lugar confirmado).
      const pideComprobante = !isCancellation && Boolean(result.requiere_pago) && Boolean(result.qrToken);

      if (pideComprobante) {
        setComprobanteRecien(true);
        setShowComprobanteModal(true);
      } else {
        setShowSuccessModal({
          show: true,
          message: isCancellation ? 'Inscripción cancelada correctamente.' : 'Te has inscrito correctamente.',
          title: isCancellation ? 'Cancelación Exitosa' : '¡Registro Exitoso!',
          type: successType,
          isCancellation // Flag para UI condicional (icono, texto extra)
        });
      }

      
      // Las plazas por desafío las lleva su propio endpoint: se revalidan aquí
      // para que el contador de la ficha refleje el registro recién hecho.
      if (hayRetos) mutarRetos();

      // Cerrar modales
      setShowRegistrationTypeModal(false);
      setShowGuestFormModal(false);
      setShowTeamFormModal(false);
      setShowUnregisterModal(false);
      setShowTallaModal(false);
      setShowRetoModal(false);

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
  
  // Reabrir el paso de pago desde la ficha (para corregir un comprobante
  // rechazado o subir el que se aplazó al inscribirse).
  const abrirComprobante = () => {
    setComprobanteRecien(false);
    setShowComprobanteModal(true);
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
          // Los miembros del club son alumnos del ITLAC casi siempre: si su
          // carrera está en el catálogo se preselecciona la institución (el
          // número de control sí lo teclea, no lo tenemos en su ficha).
          const carreraUser = user.carrera || '';
          const esDelItlac = CARRERAS_ITLAC.includes(carreraUser);
          nuevosIntegrantes[0] = {
              ...INTEGRANTE_EQUIPO_VACIO,
              nombre: user.nombre_completo || '',
              email: user.correo_electronico || '',
              telefono: user.numero_telefono || '',
              institucion_tipo: esDelItlac ? 'itlac' : '',
              // Dejar vacío si no tenemos el dato exacto, evitar autocompletado incorrecto
              institucion: esDelItlac ? '' : (user.escuela_institucion || ''),
              carrera: carreraUser,
              semestre: user.semestre?.toString() || '',
              es_capitan: true,
              es_miembro: true
          };
      }

      // El equipo arranca ya con el mínimo de filas exigido. Antes abría con
      // una sola y al enviar saltaba "Debes registrar al menos 2 integrantes".
      while (nuevosIntegrantes.length < minEq) {
          nuevosIntegrantes.push({ ...INTEGRANTE_EQUIPO_VACIO });
      }

      setTeamData({ ...teamData, integrantes: nuevosIntegrantes });
      setShowTeamFormModal(true);
    } else if (isAuthenticated) {
      // Evento repartido por desafíos: hay que elegir uno antes de nada. El
      // registro de un miembro es de un clic y éste es el único punto donde
      // preguntárselo (igual que la talla).
      if (hayRetos && !retoElegido) {
        setShowRetoModal(true);
      } else if (evento.solicitar_talla) {
        // El evento entrega playera/kit: pedir la talla antes de confirmar.
        setShowTallaModal(true);
      } else {
        handleApiRegistration('register');
      }
    } else {
      setShowRegistrationTypeModal(true);
    }
  };

  // Continuación del flujo de miembro tras elegir desafío en el mini-modal.
  const continuarTrasReto = (idReto) => {
    setRetoSeleccionado(idReto);
    setShowRetoModal(false);
    if (evento.solicitar_talla) {
      setShowTallaModal(true);
    } else {
      handleApiRegistration('register', { idReto });
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
        integrantes: [...teamData.integrantes, { ...INTEGRANTE_EQUIPO_VACIO }]
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
 
  // Mezcla un parche de varios campos en un integrante. Lo necesita el bloque
  // de institución: al cambiar ITLAC↔otra se limpian carrera y número de
  // control en UNA actualización (dos setState seguidos se pisarían).
  const patchTeamMember = (index, patch) => {
    setTeamData((prev) => ({
      ...prev,
      integrantes: prev.integrantes.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }));
  };

  const updateTeamMember = (index, field, value) => {
    patchTeamMember(index, { [field]: value });
  };

  // --- Handlers para Asesores (hasta maxAsesores) ---
  const addAsesor = () => {
    if (teamData.asesores.length >= maxAsesores) return;
    setTeamData({ ...teamData, asesores: [...teamData.asesores, { nombre: '', email: '', telefono: '', talla_playera: '' }] });
  };

  const removeAsesor = (index) => {
    if (index === 0) return; // siempre queda al menos la primera fila
    setTeamData({ ...teamData, asesores: teamData.asesores.filter((_, i) => i !== index) });
  };

  const updateAsesor = (index, field, value) => {
    const nuevos = [...teamData.asesores];
    nuevos[index] = { ...nuevos[index], [field]: value };
    setTeamData({ ...teamData, asesores: nuevos });
  };
  
  // Validaciones extra antes de enviar
  const handleTeamSubmit = (e) => {
    e.preventDefault();
    // Un equipo, un desafío: sin elegirlo el servidor rechaza el registro.
    if (hayRetos && !retoElegido) {
        toast.error('Elige el desafío en el que participa tu equipo.');
        return;
    }
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

    // Evento con playera/kit: cada integrante necesita su talla.
    if (evento.solicitar_talla && teamData.integrantes.some((m) => !m.talla_playera)) {
        toast.error('Indica la talla de playera de cada integrante.');
        return;
    }

    // Institución completa: ITLAC exige carrera del catálogo y número de
    // control; otra institución exige al menos el nombre de la escuela.
    const errorInstitucion = validarInstitucionIntegrantes(teamData.integrantes);
    if (errorInstitucion) {
        toast.error(errorInstitucion);
        return;
    }

    // Se envían sólo los asesores con algo escrito (el formulario siempre
    // pinta una fila vacía). Si el evento exige asesor, el primero debe estar
    // completo (el HTML required lo hace, pero doble check no duele).
    const asesores = teamData.asesores.filter((a) => a.nombre || a.email || a.telefono);
    if (evento.requiere_asesor && (!asesores[0]?.nombre || !asesores[0]?.email)) {
        toast.error("La información del asesor es obligatoria para este evento.");
        return;
    }

    handleApiRegistration('register_team', {
        equipo: { nombre: teamData.nombre },
        // Traduce `institucion_tipo` (estado de la interfaz) al nombre real de
        // la institución y descarta el número de control fuera del ITLAC.
        integrantes: integrantesEquipoPayload(teamData.integrantes),
        asesores
    });
  };

  if (authLoading || loading) return <LoadingSpinner fullScreen text="Cargando evento..." />;
  if (error || !evento) return <div className="min-h-screen items-center justify-center flex text-red-400">Error: {error || 'Evento no encontrado'}</div>;

  // `isPastEvent` entra en la condición: hasta ahora sólo servía para pintar el
  // badge "Finalizado" y el botón seguía activo, así que se podía uno inscribir
  // a un evento terminado y recibir por correo el QR de acceso.
  const canParticipate =
    !evento.isPastEvent
    && !evento.registroCerrado
    && (evento.cupos === null || evento.cupos_disponibles > 0)
    // Los cupos por desafío son un tope independiente del aforo: si no queda
    // plaza en ninguno, no hay dónde inscribirse.
    && !retosLlenos;

  return (
    <motion.main
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="min-h-screen bg-bg text-fg pb-20 font-sans"
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
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
          </div>

          <div className="absolute top-0 left-0 w-full p-6 z-20 pointer-events-none">
             <div className="max-w-7xl mx-auto px-6 md:px-12 pointer-events-auto">
                <button onClick={() => router.push('/eventos')} className="text-white/80 hover:text-white flex items-center bg-black/30 px-4 py-2 rounded-full backdrop-blur-md transition-all hover:bg-black/50">
                    <ArrowLeft size={18} className="mr-2" /> Regresar
                </button>
             </div>
          </div>

          <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 max-w-7xl mx-auto flex flex-col md:flex-row items-end gap-8 z-10 w-full left-1/2 -translate-x-1/2">
              <div className="relative w-48 h-64 md:w-64 md:h-80 shadow-2xl rounded-xl overflow-hidden border-4 border-bg hidden md:block flex-shrink-0 cursor-pointer group" onClick={() => { setSelectedImageUrl(evento.imagen_url || '/placeholder-event.jpg'); setShowImageModal(true); }}>
                  <Image src={evento.imagen_url || '/placeholder-event.jpg'} alt="Flyer" fill sizes="256px" className="object-cover group-hover:scale-105 transition-transform duration-500"/>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                     <EyeIcon className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" size={32} />
                  </div>
              </div>

              <div className="flex-1 mb-4">
                  {/* Dos sistemas separados: tag de CATEGORÍA (outline) + badge
                      de ESTADO (sólido, mismo mapeo de color que las tarjetas).
                      Antes categoría y estado eran pastillas outline gemelas. */}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                      <CategoriaTag className="backdrop-blur-md">{evento.tipo_evento_display}</CategoriaTag>
                      {esRegistroPorEquipos && (
                        <CategoriaTag className="backdrop-blur-md">{rangoEquipos(minEq, maxEq)}</CategoriaTag>
                      )}
                      <EstadoBadge estado={estadoDeEvento(evento, isRegistered)} />
                  </div>

                  <h1 className="text-4xl md:text-6xl font-black mb-5 leading-tight tracking-tight text-white drop-shadow-xl">
                      {evento.nombre_evento}
                  </h1>

                  {/* Mismo tratamiento de iconografía que las tarjetas: cajita
                      con fondo suave y paleta semántica fija (fecha→brand,
                      hora→info, ubicación→accent). */}
                  <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm md:text-base font-medium text-gray-200">
                      <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand backdrop-blur-sm"><Calendar size={17} aria-hidden="true"/></span>
                          {formatearFechaLarga(evento.fecha)}
                      </div>
                      <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-soft text-info backdrop-blur-sm"><Clock size={17} aria-hidden="true"/></span>
                          {formatearHora(evento.hora_inicio)} – {formatearHora(evento.hora_fin)}
                      </div>
                      <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent backdrop-blur-sm"><MapPin size={17} aria-hidden="true"/></span>
                          {evento.ubicacion || 'Por definir'}
                      </div>
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
                  <h2 className="text-2xl font-bold mb-6 text-fg">Sobre el evento</h2>
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

              {/* Datos del concurso. Minimalista a propósito: un solo panel con
                  etiqueta + valor, sin iconos ni chips de color (los tenía y
                  competían con el contenido en vez de informar). */}
              {evento.id_concurso && (
                   <div className="mt-8 grid grid-cols-1 overflow-hidden rounded-2xl border border-line bg-surface divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                        <div className="p-5 text-center">
                            <p className="text-xs uppercase tracking-wider text-faint">Participación</p>
                            <p className="mt-1.5 text-sm font-medium text-fg">
                                {evento.modalidad === 'equipos'
                                    ? `${rangoEquipos(minEq, maxEq)}${evento.requiere_asesor && !evento.asesor_participa ? ' + asesor' : ''}`
                                    : 'Individual'}
                            </p>
                        </div>

                        <div className="p-5 text-center">
                            <p className="text-xs uppercase tracking-wider text-faint">
                                {maxAsesores > 1 ? 'Asesores' : 'Asesor'}
                            </p>
                            <p className="mt-1.5 text-sm font-medium text-fg">
                                {evento.requiere_asesor ? 'Requerido' : 'Opcional'}
                                {maxAsesores > 1 ? ` · hasta ${maxAsesores}` : ''}
                            </p>
                            {evento.modalidad === 'equipos' && (
                              <p className="mt-0.5 text-xs text-faint">
                                  {evento.asesor_participa ? 'Participa como integrante' : 'No ocupa lugar en el equipo'}
                              </p>
                            )}
                        </div>

                        <div className="p-5 text-center">
                            <p className="text-xs uppercase tracking-wider text-faint">Plataforma</p>
                            {evento.url_concurso ? (
                                <a
                                    href={evento.url_concurso}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-1.5 inline-block text-sm font-medium text-brand underline decoration-brand/40 underline-offset-4 transition-colors hover:decoration-brand"
                                >
                                    Ir a la plataforma
                                </a>
                            ) : (
                                <p className="mt-1.5 text-sm text-muted">No especificada</p>
                            )}
                        </div>
                   </div>
              )}

              {/* Desafíos del evento (migración 014). Cada uno lleva su propio
                  cupo de equipos, así que aquí se ve dónde queda sitio ANTES de
                  abrir el formulario. */}
              {hayRetos && (
                  <div className="mt-8 rounded-2xl border border-line bg-surface p-6 md:p-8">
                      <div className="mb-5 flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                              <Target size={17} aria-hidden="true" />
                          </span>
                          <div>
                              <h2 className="text-2xl font-bold text-fg">Desafíos</h2>
                              <p className="text-sm text-muted">
                                  Cada inscripción elige uno y cada desafío tiene su propio cupo.
                              </p>
                          </div>
                      </div>

                      <ul className="space-y-3">
                          {retos.map((reto, i) => {
                              const seleccionado = String(reto.id_reto) === retoElegido;
                              return (
                                  <li
                                      key={reto.id_reto}
                                      className={`rounded-xl border p-4 transition-colors ${
                                          seleccionado
                                            ? 'border-brand/50 bg-brand-soft'
                                            : 'border-line bg-surface-2'
                                      }`}
                                  >
                                      <div className="flex items-start gap-4">
                                          {reto.imagen_url && (
                                              <Image
                                                  src={reto.imagen_url}
                                                  alt=""
                                                  width={72}
                                                  height={72}
                                                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                                              />
                                          )}
                                          <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-baseline gap-x-2">
                                                  <span className="text-xs font-bold tabular-nums text-faint">
                                                      {String(i + 1).padStart(2, '0')}
                                                  </span>
                                                  <h3 className="font-semibold text-fg">{reto.titulo}</h3>
                                              </div>
                                              {reto.lede && <p className="mt-1 text-sm text-muted">{reto.lede}</p>}
                                              {reto.resumen && (
                                                  <p className="mt-1.5 text-sm text-faint">{reto.resumen}</p>
                                              )}
                                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                                  {reto.cupo_equipos === null ? (
                                                      <span className="text-faint">Sin límite de {unidadReto}</span>
                                                  ) : reto.lleno ? (
                                                      <span className="font-medium text-danger">Cupo lleno</span>
                                                  ) : (
                                                      <span className="text-muted">
                                                          Quedan{' '}
                                                          <span className="font-semibold text-fg">
                                                              {reto.equipos_disponibles}
                                                          </span>{' '}
                                                          de {reto.cupo_equipos} {unidadReto}
                                                      </span>
                                                  )}
                                                  {reto.patrocinador && (
                                                      <span className="text-faint">· {reto.patrocinador}</span>
                                                  )}
                                              </div>
                                          </div>
                                          {!isRegistered && canParticipate && !reto.lleno && (
                                              <Button
                                                  size="sm"
                                                  variant={seleccionado ? 'primary' : 'secondary'}
                                                  onClick={() => setRetoSeleccionado(String(reto.id_reto))}
                                                  className="shrink-0"
                                              >
                                                  {seleccionado ? 'Elegido' : 'Elegir'}
                                              </Button>
                                          )}
                                      </div>
                                  </li>
                              );
                          })}
                      </ul>
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
                            
                            {/* Antes este bloque decía siempre "Pago pendiente de
                                verificación", tanto a quien no había pagado como a
                                quien ya tenía el pago validado. Ahora refleja el
                                comprobante real de la inscripción. */}
                            {isRegistered ? (
                                <div className="mt-3 space-y-3">
                                    {comprobante ? (
                                        <EstadoPago comprobante={comprobante} />
                                    ) : (
                                        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                                            <AlertTriangle size={16} aria-hidden="true" />
                                            <span>Falta tu comprobante de pago</span>
                                        </div>
                                    )}
                                    {comprobante?.estado !== 'aprobado' && (
                                        <Button variant="secondary" className="w-full justify-center" onClick={abrirComprobante}>
                                            <Receipt size={16} className="mr-2" aria-hidden="true" />
                                            {comprobante ? 'Actualizar comprobante' : 'Subir comprobante'}
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="text-xs text-gray-500 mt-1">
                                    * Al inscribirte se te pedirá una imagen del comprobante de pago.
                                </div>
                            )}

                            {evento.instrucciones_pago && (
                                <p className="mt-3 whitespace-pre-line border-t border-line pt-3 text-xs text-muted">
                                    {evento.instrucciones_pago}
                                </p>
                            )}
                        </div>
                   )}

                   {/* Aforo en términos de OCUPACIÓN: la barra se llena conforme
                       se llena el evento. Antes representaba disponibilidad
                       ("147/150 disponibles" = barra llena de verde), que
                       comunicaba justo lo contrario. */}
                   <div className="mb-6 pb-6 border-b border-line">
                       {evento.cupos === null ? (
                           <div className="flex justify-between items-center">
                               <span className="text-muted font-medium">Aforo</span>
                               <span className="font-bold text-fg">Ilimitado</span>
                           </div>
                       ) : (() => {
                           const cupos = Number(evento.cupos);
                           const ocupados = Math.min(
                             cupos,
                             Number(evento.lugares_ocupados ?? Math.max(0, cupos - (evento.cupos_disponibles ?? 0))),
                           );
                           const libres = Math.max(0, cupos - ocupados);
                           const pct = Math.max(0, Math.min(100, (ocupados / cupos) * 100));
                           const colorBarra = libres === 0 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-brand';
                           return (
                               <>
                                   <div className="flex justify-between items-baseline mb-2">
                                       <span className="text-muted font-medium">Aforo</span>
                                       <span className="text-sm text-muted">
                                           <span className="text-xl font-bold text-fg">{ocupados}</span> de {cupos} inscritos
                                       </span>
                                   </div>
                                   <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden">
                                       <div className={`${colorBarra} h-full transition-all`} style={{ width: `${pct}%` }} />
                                   </div>
                                   <p className={`mt-2 text-xs ${libres === 0 ? 'text-danger' : libres <= cupos * 0.2 ? 'text-warning' : 'text-faint'}`}>
                                       {libres === 0 ? 'No quedan lugares' : `Quedan ${libres} lugares`}
                                   </p>
                               </>
                           );
                       })()}
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
                              : retosLlenos
                                ? 'Desafíos llenos'
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
      
      {/* Modal Equipos. Un SOLO contenedor con scroll (el cuerpo del modal):
          antes el formulario traía su propio max-h + overflow dentro del cuerpo
          que ya scrollea, y ese doble scroll anidado cortaba los campos al
          escribir. Los botones viven en el footer fijo del modal. */}
      <Modal
        isOpen={showTeamFormModal}
        onClose={() => setShowTeamFormModal(false)}
        title="Registro de Equipo"
        description={evento.modalidad === 'equipos' ? rangoEquipos(minEq, maxEq) : undefined}
        size="2xl"
        footer={
          <>
            <Button type="button" onClick={() => setShowTeamFormModal(false)} variant="secondary" disabled={actionLoading}>Cancelar</Button>
            <Button type="submit" form="form-equipo" loading={actionLoading}>Registrar Equipo</Button>
          </>
        }
      >
         <form id="form-equipo" onSubmit={handleTeamSubmit} className="space-y-6">
            <div className="space-y-4">
                <h3 className="text-brand font-bold border-b border-line pb-2">Datos del Equipo</h3>
                {/* Un equipo, un desafío: el cupo de cada uno lo comprueba el
                    servidor al guardar, así que la lista sólo orienta. */}
                {hayRetos && (
                  <Select
                    label="Desafío"
                    value={retoElegido}
                    onChange={(e) => setRetoSeleccionado(e.target.value)}
                    options={opcionesReto}
                    placeholder="Selecciona el desafío"
                    required
                    help={`Cada desafío admite un número limitado de ${unidadReto}.`}
                  />
                )}
                <Input label="Nombre del equipo" value={teamData.nombre} onChange={e => setTeamData({...teamData, nombre: e.target.value})} required/>

                <div className="space-y-3 bg-surface-2 p-4 rounded-xl border border-line">
                    <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-bold text-fg">
                            {teamData.asesores.length > 1 ? 'Asesores' : 'Asesor'}
                            {evento.requiere_asesor
                              ? <span className="text-danger"> *</span>
                              : <span className="text-faint font-normal"> (opcional)</span>}
                        </h4>
                        {maxAsesores > 1 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={addAsesor}
                            disabled={teamData.asesores.length >= maxAsesores}
                          >
                            <Plus size={14} aria-hidden="true"/> Agregar asesor ({teamData.asesores.length}/{maxAsesores})
                          </Button>
                        )}
                    </div>
                    {evento.asesor_participa ? (
                      <p className="text-xs text-muted">
                        En este concurso el asesor participa como integrante: inclúyelo también en la lista de integrantes.
                      </p>
                    ) : (
                      <p className="text-xs text-muted">
                        El asesor acompaña al equipo y no ocupa lugar entre los integrantes.
                      </p>
                    )}

                    {teamData.asesores.map((asesor, idx) => (
                        <div key={idx} className="relative rounded-lg border border-line bg-surface p-3">
                            {idx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => removeAsesor(idx)}
                                  aria-label={`Quitar asesor ${idx + 1}`}
                                  className="absolute top-2 right-2 rounded p-1 text-danger hover:bg-surface-2"
                                >
                                    <Trash2 size={15} aria-hidden="true"/>
                                </button>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <Input label="Nombre" value={asesor.nombre} onChange={e => updateAsesor(idx, 'nombre', e.target.value)} required={evento.requiere_asesor && idx === 0}/>
                                <Input label="Email" type="email" value={asesor.email} onChange={e => updateAsesor(idx, 'email', e.target.value)} required={evento.requiere_asesor && idx === 0}/>
                                <Input label="Teléfono" value={asesor.telefono} onChange={e => updateAsesor(idx, 'telefono', e.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="10 dígitos"/>
                                {/* Al asesor también se le entrega playera: sin
                                    talla el staff la marca a ciegas en la puerta. */}
                                {evento.solicitar_talla && (
                                  <Select
                                    label="Talla de playera"
                                    value={asesor.talla_playera || ''}
                                    onChange={e => updateAsesor(idx, 'talla_playera', e.target.value)}
                                    options={TALLAS_PLAYERA}
                                    placeholder="Selecciona la talla"
                                  />
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-line pb-2">
                        <h3 className="text-brand font-bold">
                            Integrantes <span className="text-muted text-sm font-normal ml-2">{rangoEquipos(minEq, maxEq)}</span>
                        </h3>
                        <Button type="button" size="sm" onClick={addTeamMember} disabled={Boolean(maxEq) && teamData.integrantes.length >= maxEq} variant="secondary">
                            <Plus size={14} aria-hidden="true"/> Agregar integrante ({teamData.integrantes.length}{maxEq ? `/${maxEq}` : ''})
                        </Button>
                    </div>

                    {teamData.integrantes.map((member, idx) => (
                        <div key={idx} className="bg-surface-2 p-4 rounded-xl border border-line relative">
                            {idx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => removeTeamMember(idx)}
                                  aria-label={`Quitar integrante ${idx + 1}`}
                                  className="absolute top-2 right-2 rounded p-1 text-danger hover:bg-surface"
                                >
                                    <Trash2 size={16} aria-hidden="true"/>
                                </button>
                            )}
                            <h4 className="text-xs uppercase font-bold text-muted mb-2">Integrante {idx + 1} {idx === 0 ? '(Capitán)' : ''}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input label="Email" type="email" value={member.email} onChange={e => updateTeamMember(idx, 'email', e.target.value)} required placeholder="Correo personal o institucional"/>
                                <Input label="Nombre" value={member.nombre} onChange={e => updateTeamMember(idx, 'nombre', e.target.value)} required/>
                                <div className="md:col-span-2">
                                    <p className="text-xs text-muted mb-2">Si el integrante es miembro del club, usa su correo registrado para vincular su cuenta automáticamente.</p>
                                </div>
                                <Input label="Teléfono" value={member.telefono} onChange={e => updateTeamMember(idx, 'telefono', e.target.value.replace(/\D/g, '').slice(0, 15))} required placeholder="10 dígitos"/>
                                {/* Institución elegible (ITLAC → catálogo de carreras +
                                    número de control; otra → escuela y carrera opcional).
                                    Mismo bloque que usa el registro manual del admin. */}
                                <CamposInstitucionIntegrante data={member} onPatch={(patch) => patchTeamMember(idx, patch)} />
                                {/* Sólo cuando el evento entrega playera/kit. */}
                                {evento.solicitar_talla && (
                                  <Select
                                    label="Talla de playera"
                                    value={member.talla_playera || ''}
                                    onChange={e => updateTeamMember(idx, 'talla_playera', e.target.value)}
                                    options={TALLAS_PLAYERA}
                                    placeholder="Selecciona la talla"
                                    required
                                  />
                                )}
                             </div>
                        </div>
                    ))}
                </div>
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

      {/* Formulario Invitado: mismos campos compartidos que el listado y los
          programas (nivel de estudios, edad, talla si el evento la pide). */}
      <Modal
        isOpen={showGuestFormModal}
        onClose={() => { setShowGuestFormModal(false); setGuestErrors({}); }}
        title="Registro como invitado"
        description={evento.nombre_evento}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowGuestFormModal(false); setGuestErrors({}); }} disabled={actionLoading}>
              Cancelar
            </Button>
            <Button
              loading={actionLoading}
              onClick={() => {
                if (hayRetos && !retoElegido) {
                  toast.error('Elige el desafío en el que quieres participar.', { theme: 'dark' });
                  return;
                }
                const errors = validarInvitado(guestData, { requiereTalla: Boolean(evento.solicitar_talla) });
                setGuestErrors(errors);
                if (Object.keys(errors).length > 0) {
                  toast.error('Revisa los campos marcados en rojo.', { theme: 'dark' });
                  return;
                }
                handleApiRegistration('register', { guestData: limpiarInvitadoPayload(guestData) });
              }}
            >
              Confirmar registro
            </Button>
          </>
        }
      >
          {hayRetos && (
            <div className="mb-5">
              <Select
                label="Desafío"
                value={retoElegido}
                onChange={(e) => setRetoSeleccionado(e.target.value)}
                options={opcionesReto}
                placeholder="Selecciona el desafío"
                required
                help={`Cada desafío admite un número limitado de ${unidadReto}.`}
              />
            </div>
          )}
          <CamposInvitado
            data={guestData}
            errors={guestErrors}
            onChange={setGuestData}
            requiereTalla={Boolean(evento.solicitar_talla)}
          />
      </Modal>

      {/* Desafío del miembro: mismo patrón que la talla. El registro de un
          miembro es de un clic, así que el desafío se pregunta aquí y el flujo
          continúa con la talla (si el evento la pide) o con el registro. */}
      <Modal
        isOpen={showRetoModal}
        onClose={() => setShowRetoModal(false)}
        title="Elige tu desafío"
        description={evento.nombre_evento}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowRetoModal(false)} disabled={actionLoading}>
              Cancelar
            </Button>
            <Button
              loading={actionLoading}
              disabled={!retoElegido}
              onClick={() => continuarTrasReto(retoElegido)}
            >
              Continuar
            </Button>
          </>
        }
      >
        <Select
          label="Desafío"
          value={retoElegido}
          onChange={(e) => setRetoSeleccionado(e.target.value)}
          options={opcionesReto}
          placeholder="Selecciona el desafío"
          required
          help={`Cada desafío admite un número limitado de ${unidadReto}.`}
        />
      </Modal>

      {/* Talla del miembro (eventos con solicitar_talla): el registro de
          miembro es de un clic y éste es el único punto donde preguntarla. */}
      <TallaModal
        isOpen={showTallaModal}
        onClose={() => setShowTallaModal(false)}
        titulo={evento.nombre_evento}
        loading={actionLoading}
        onConfirm={(talla) => handleApiRegistration('register', { tallaPlayera: talla, idReto: retoElegido })}
      />

      {/* Comprobante de pago: paso siguiente al registro en eventos con costo,
          y también la vía para corregirlo si el staff lo rechaza. */}
      <ComprobantePagoModal
        isOpen={showComprobanteModal}
        onClose={() => setShowComprobanteModal(false)}
        evento={{
          nombre: evento.nombre || evento.nombre_evento,
          costo: evento.costo,
          instrucciones_pago: evento.instrucciones_pago,
        }}
        qrToken={qrToken}
        comprobante={comprobante}
        recienInscrito={comprobanteRecien}
        onSaved={(guardado) => {
          // Se parchea la caché de SWR con lo que acaba de devolver el servidor
          // en vez de volver a preguntar por el estado completo.
          mutarEstadoPago((previo) => ({ ...(previo || {}), comprobante: guardado }), { revalidate: false });
          setShowComprobanteModal(false);
          toast.success('Comprobante enviado. Lo validaremos antes del evento.', { theme: 'dark' });
        }}
      />

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
