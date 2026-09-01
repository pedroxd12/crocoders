// src/app/programas/ProgramasClient.jsx
'use client';

import { useMemo, useState, Suspense } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { fetcher, postFetcher } from '@/lib/fetcher';
import { toast } from 'react-toastify';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Calendar, Clock, MapPin, Users, BookOpen, Award, LogIn, UserPlus, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatearFecha, formatearDiasSemana, formatearHora } from '@/lib/programas-fechas';

const carreras = [
  'Ingeniería en Sistemas Computacionales', 'Ingeniería en Electronica',
  'Ingeniería Industrial', 'Ingeniería Quimica',
  'Ingeniería en Logistica', 'Ingeniería en Mecatronica',
];
const semestres = Array.from({ length: 14 }, (_, i) => ({ value: (i + 1).toString(), label: `${i + 1}° Semestre` }));

const GUEST_VACIO = {
  nombre_completo: '', correo_electronico: '', numero_telefono: '',
  carrera: '', semestre: '', escuela_institucion: '',
};

// `programasIniciales` es el catálogo que el Server Component de page.jsx ya
// consultó y envió dentro del HTML; se le pasa a SWR como `fallbackData` para
// que el primer render lo pinte sin pedir nada.
function ProgramasContent({ programasIniciales }) {
  const router = useRouter();
  const { isAuthenticated, user, loading: authLoading } = useAuth();

  const [registrationOverrides, setRegistrationOverrides] = useState({});
  const [selected, setSelected] = useState(null); // programa elegido para inscribir
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guestData, setGuestData] = useState(GUEST_VACIO);
  const [formErrors, setFormErrors] = useState({});
  const [aCancelar, setACancelar] = useState(null);
  const [cancelando, setCancelando] = useState(false);

  const { data: programasRaw, error, isLoading } = useSWR('/api/programas', fetcher, {
    revalidateOnFocus: false,
    fallbackData: programasIniciales,
    // Los datos que llegaron con el HTML se acaban de leer de la base: volver a
    // pedirlos al montar desharía el ahorro del render en servidor. Si el
    // servidor no pudo consultarlos, `programasIniciales` es undefined y SWR
    // recupera su carga normal.
    revalidateOnMount: programasIniciales === undefined,
  });

  const programas = useMemo(() => (Array.isArray(programasRaw) ? programasRaw : []), [programasRaw]);
  const programaIds = useMemo(() => programas.map(p => p.id_programa), [programas]);

  const canCheck = isAuthenticated && user?.id_miembro && programaIds.length > 0;
  const { data: batchData, mutate: mutateBatch } = useSWR(
    canCheck ? ['/api/programas/check-register-batch', { programaIds }] : null,
    postFetcher,
    { revalidateOnFocus: false },
  );
  const registrationStatus = useMemo(
    () => ({ ...(batchData?.registered || {}), ...registrationOverrides }),
    [batchData, registrationOverrides],
  );

  const handleParticipate = (programa) => {
    setSelected(programa);
    if (registrationStatus[programa.id_programa]) {
      toast.info('Ya estás inscrito en este programa.', { theme: 'dark' });
      return;
    }
    // La comprobación de sesión sólo bloquea ESTA acción: pulsar antes de que
    // termine le mostraría el modal de invitado a un miembro.
    if (authLoading) {
      toast.info('Un momento, verificando tu sesión…', { theme: 'dark' });
      return;
    }
    if (isAuthenticated) {
      inscribirMiembro(programa);
    } else {
      setShowTypeModal(true);
    }
  };

  const inscribirMiembro = async (programa) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/programas/${programa.id_programa}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programaId: programa.id_programa, tipo: 'miembro' }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error al inscribirse');
      setRegistrationOverrides(prev => ({ ...prev, [programa.id_programa]: true }));
      mutateBatch();
      toast.success('¡Inscripción exitosa!', { theme: 'dark' });
      setShowTypeModal(false);
    } catch (e) {
      toast.error(`Error: ${e.message}`, { theme: 'dark' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelarInscripcion = async () => {
    if (!aCancelar) return;
    setCancelando(true);
    try {
      const res = await fetch(`/api/programas/${aCancelar.id_programa}/unregister`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'No se pudo cancelar la inscripción');
      setRegistrationOverrides(prev => ({ ...prev, [aCancelar.id_programa]: false }));
      mutateBatch();
      toast.success('Inscripción cancelada', { theme: 'dark' });
      setACancelar(null);
    } catch (e) {
      toast.error(`Error: ${e.message}`, { theme: 'dark' });
    } finally {
      setCancelando(false);
    }
  };

  const validateGuest = () => {
    const errs = {};
    if (!guestData.nombre_completo.trim()) errs.nombre_completo = 'Escribe tu nombre completo';
    if (!/\S+@\S+\.\S+/.test(guestData.correo_electronico)) errs.correo_electronico = 'Correo no válido';
    if (!/^[0-9]{10}$/.test(guestData.numero_telefono)) errs.numero_telefono = 'El teléfono debe tener 10 dígitos';
    if (!guestData.carrera) errs.carrera = 'Selecciona tu carrera';
    if (!guestData.semestre) errs.semestre = 'Selecciona tu semestre';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const inscribirInvitado = async () => {
    // Sin este aviso el botón parecía no hacer nada: la validación fallaba en
    // silencio y el usuario no sabía qué campo estaba mal.
    if (!validateGuest()) {
      toast.error('Revisa los campos marcados en rojo.', { theme: 'dark' });
      return;
    }
    if (!selected) return;

    setIsSubmitting(true);
    try {
      const guestRes = await fetch('/api/invitados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guestData),
      });
      const guest = await guestRes.json();
      if (!guestRes.ok) throw new Error(guest.error || 'Error al crear invitado');

      const res = await fetch(`/api/programas/${selected.id_programa}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `guestToken` es la credencial firmada que devuelve /api/invitados: sin
        // ella el servidor rechaza la inscripción (evita que alguien inscriba a
        // terceros adivinando su id).
        body: JSON.stringify({
          programaId: selected.id_programa,
          tipo: 'invitado',
          userId: guest.id_invitado,
          guestToken: guest.guestToken,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error al inscribirse');

      setRegistrationOverrides(prev => ({ ...prev, [selected.id_programa]: true }));
      toast.success('¡Inscripción como invitado exitosa!', { theme: 'dark' });
      setShowGuestModal(false);
      setShowTypeModal(false);
      setGuestData(GUEST_VACIO);
      setFormErrors({});
    } catch (e) {
      toast.error(`Error: ${e.message}`, { theme: 'dark' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // El catálogo de programas es PÚBLICO. Incluir `authLoading` en esta guarda
  // dejaba la pantalla en blanco hasta que /api/auth/verify —que va a la base
  // de datos— respondiera, y esa espera la pagaba también quien no tiene
  // sesión. El estado de inscripción de cada tarjeta llega por su propio SWR.
  if (isLoading) return <LoadingSpinner fullScreen showText text="Cargando programas..." />;
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-danger">
        No se pudieron cargar los programas. Vuelve a intentarlo en un momento.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-fg pb-20">
      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="text-4xl md:text-5xl font-black mb-3 pr-20 md:pr-0">Programas y Talleres</h1>
          <p className="text-muted max-w-2xl mb-10">
            Cursos y talleres recurrentes del club. Inscríbete y asiste a las sesiones para acreditar tu participación.
          </p>
        </motion.div>

        {programas.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No hay programas disponibles"
            description="Aún no hay cursos ni talleres publicados. Vuelve pronto."
            className="py-20"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {programas.map((p, idx) => {
              const inscrito = registrationStatus[p.id_programa];
              const finalizado = p.estado === 'past';
              const dias = formatearDiasSemana(p.dias_semana);
              const hora = formatearHora(p.hora_inicio);
              return (
                <motion.div
                  key={p.id_programa}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  className="bg-surface rounded-xl border border-line overflow-hidden flex flex-col hover:border-brand/30 transition-colors"
                >
                  <div className="relative h-44 w-full bg-surface-2">
                    {p.imagen_url ? (
                      <Image src={p.imagen_url} alt={p.nombre} fill className="object-cover" sizes="(max-width:768px) 100vw, 33vw" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-faint"><BookOpen size={40} /></div>
                    )}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                      {p.tipo && <Badge tone="success">{p.tipo}</Badge>}
                      {finalizado && <Badge tone="danger">Finalizado</Badge>}
                      {inscrito && <Badge tone="info"><CheckCircle size={12} /> Inscrito</Badge>}
                    </div>
                  </div>

                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="text-lg font-bold mb-2">{p.nombre}</h3>
                    <div className="space-y-1.5 text-sm text-muted mb-4 flex-1">
                      <div className="flex items-center gap-2">
                        <Calendar size={15} className="text-brand shrink-0" />
                        {formatearFecha(p.fecha_inicio, { day: 'numeric', month: 'short' })} – {formatearFecha(p.fecha_fin, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      {dias && (
                        <div className="flex items-center gap-2">
                          <Clock size={15} className="text-info shrink-0" />
                          {dias}{hora ? ` · ${hora}` : ''}
                        </div>
                      )}
                      {p.ubicacion && (
                        <div className="flex items-center gap-2">
                          <MapPin size={15} className="text-danger shrink-0" />{p.ubicacion}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Users size={15} className="text-faint shrink-0" />
                        {p.total_inscritos} inscrito(s) · {p.total_sesiones} sesión(es)
                      </div>
                      {p.sesiones_requeridas_certificado > 0 && (
                        <div className="flex items-center gap-2">
                          <Award size={15} className="text-warning shrink-0" />
                          Acreditación: {p.sesiones_requeridas_certificado}+ sesiones
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Button
                        onClick={() => handleParticipate(p)}
                        variant={inscrito ? 'secondary' : 'primary'}
                        disabled={isSubmitting || finalizado || inscrito}
                        className="w-full"
                      >
                        {inscrito ? 'Ya inscrito' : finalizado ? 'Finalizado' : 'Inscribirme'}
                      </Button>
                      {/* Existía el endpoint de baja pero ninguna pantalla lo llamaba:
                          para cancelar había que pedírselo a un administrador. */}
                      {inscrito && isAuthenticated && !finalizado && (
                        <Button
                          onClick={() => setACancelar(p)}
                          variant="ghost"
                          color="red"
                          className="w-full"
                        >
                          Cancelar inscripción
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal tipo de inscripción (invitado vs miembro) */}
      <Modal isOpen={showTypeModal} onClose={() => setShowTypeModal(false)} title="Confirmar inscripción" size="md">
        <p className="text-muted mb-6">¿Cómo deseas inscribirte a &quot;{selected?.nombre}&quot;?</p>
        <div className="space-y-3">
          <Button onClick={() => router.push('/iniciar?redirect=/programas')} variant="primary" className="w-full">
            <LogIn size={18} />Soy miembro (iniciar sesión)
          </Button>
          <Button onClick={() => { setShowTypeModal(false); setShowGuestModal(true); }} variant="secondary" className="w-full">
            <UserPlus size={18} />Soy invitado
          </Button>
        </div>
      </Modal>

      {/* Modal invitado */}
      <Modal
        isOpen={showGuestModal}
        onClose={() => { setShowGuestModal(false); setFormErrors({}); }}
        title="Inscripción como invitado"
        description={selected?.nombre}
        footer={
          <>
            <Button onClick={() => { setShowGuestModal(false); setFormErrors({}); }} variant="secondary" disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={inscribirInvitado} variant="primary" loading={isSubmitting}>
              Confirmar inscripción
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nombre completo"
            value={guestData.nombre_completo}
            onChange={(e) => setGuestData({ ...guestData, nombre_completo: e.target.value })}
            error={formErrors.nombre_completo}
            required
          />
          <Input
            label="Correo electrónico"
            type="email"
            value={guestData.correo_electronico}
            onChange={(e) => setGuestData({ ...guestData, correo_electronico: e.target.value })}
            error={formErrors.correo_electronico}
            required
          />
          <Input
            label="Teléfono"
            value={guestData.numero_telefono}
            onChange={(e) => setGuestData({ ...guestData, numero_telefono: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            placeholder="10 dígitos"
            error={formErrors.numero_telefono}
            required
          />
          {/* El campo se enviaba a /api/invitados pero no existía en el formulario:
              todos los invitados quedaban sin institución. */}
          <Input
            label="Escuela o institución"
            value={guestData.escuela_institucion}
            onChange={(e) => setGuestData({ ...guestData, escuela_institucion: e.target.value })}
            help="Opcional. Si vienes de otra escuela, indícalo aquí."
          />
          <Select
            label="Carrera"
            value={guestData.carrera}
            onChange={(e) => setGuestData({ ...guestData, carrera: e.target.value })}
            options={carreras.map(c => ({ value: c, label: c }))}
            placeholder="Selecciona tu carrera"
            error={formErrors.carrera}
            required
          />
          <Select
            label="Semestre"
            value={guestData.semestre}
            onChange={(e) => setGuestData({ ...guestData, semestre: e.target.value })}
            options={semestres}
            placeholder="Selecciona tu semestre"
            error={formErrors.semestre}
            required
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(aCancelar)}
        onClose={() => setACancelar(null)}
        onConfirm={cancelarInscripcion}
        loading={cancelando}
        title={`¿Cancelar tu inscripción a “${aCancelar?.nombre || ''}”?`}
        message="Dejarás de aparecer en las listas de asistencia del programa."
        consequences={[
          'Perderás tu lugar y tendrás que volver a inscribirte si cambias de idea',
          'Tu asistencia registrada hasta ahora deja de contar para la acreditación',
        ]}
        confirmLabel="Cancelar inscripción"
        cancelLabel="Seguir inscrito"
      />
    </div>
  );
}

export default function ProgramasClient({ programasIniciales }) {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen showText text="Cargando programas..." />}>
      <ProgramasContent programasIniciales={programasIniciales} />
    </Suspense>
  );
}
