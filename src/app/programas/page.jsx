// src/app/programas/page.jsx
'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
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
import LoadingSpinner from '@/components/LoadingSpinner';
import { Calendar, Clock, MapPin, Users, BookOpen, Award, LogIn, UserPlus, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const carreras = [
  'Ingeniería en Sistemas Computacionales', 'Ingeniería en Electronica',
  'Ingeniería Industrial', 'Ingeniería Quimica',
  'Ingeniería en Logistica', 'Ingeniería en Mecatronica',
];
const semestres = Array.from({ length: 14 }, (_, i) => ({ value: (i + 1).toString(), label: `${i + 1}° Semestre` }));

function formatTime(t) {
  if (!t) return null;
  const [h, m] = t.toString().split(':');
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(m, 10));
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function ProgramasContent() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [registrationOverrides, setRegistrationOverrides] = useState({});
  const [selected, setSelected] = useState(null); // programa elegido para inscribir
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guestData, setGuestData] = useState({
    nombre_completo: '', correo_electronico: '', numero_telefono: '', carrera: '', semestre: '', escuela_institucion: '',
  });
  const [formErrors, setFormErrors] = useState({});

  const { data: programasRaw, error, isLoading } = useSWR('/api/programas', fetcher, { revalidateOnFocus: false });

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

  const validateGuest = () => {
    const errs = {};
    if (!guestData.nombre_completo.trim()) errs.nombre_completo = 'Nombre requerido';
    if (!/\S+@\S+\.\S+/.test(guestData.correo_electronico)) errs.correo_electronico = 'Email no válido';
    if (!/^[0-9]{10}$/.test(guestData.numero_telefono)) errs.numero_telefono = 'Teléfono de 10 dígitos';
    if (!guestData.carrera) errs.carrera = 'Carrera requerida';
    if (!guestData.semestre) errs.semestre = 'Semestre requerido';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const inscribirInvitado = async () => {
    if (!validateGuest() || !selected) return;
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
        body: JSON.stringify({ programaId: selected.id_programa, tipo: 'invitado', userId: guest.id_invitado }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error al inscribirse');

      setRegistrationOverrides(prev => ({ ...prev, [selected.id_programa]: true }));
      toast.success('¡Inscripción como invitado exitosa!', { theme: 'dark' });
      setShowGuestModal(false);
      setShowTypeModal(false);
      setGuestData({ nombre_completo: '', correo_electronico: '', numero_telefono: '', carrera: '', semestre: '', escuela_institucion: '' });
      setFormErrors({});
    } catch (e) {
      toast.error(`Error: ${e.message}`, { theme: 'dark' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || isLoading) return <LoadingSpinner fullScreen text="Cargando programas..." />;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-400">Error al cargar los programas.</div>;

  return (
    <div className="min-h-screen bg-[#0f1014] text-white pb-20">
      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="text-4xl md:text-5xl font-black mb-3 pr-20 md:pr-0">Programas y Talleres</h1>
          <p className="text-gray-400 max-w-2xl mb-10">
            Cursos y talleres recurrentes del club. Inscríbete y asiste a las sesiones para obtener tu certificado.
          </p>
        </motion.div>

        {programas.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <BookOpen className="mx-auto mb-4 opacity-30" size={48} />
            <p>No hay programas disponibles por el momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {programas.map((p, idx) => {
              const inscrito = registrationStatus[p.id_programa];
              const finalizado = p.estado === 'past';
              const dias = Array.isArray(p.dias_semana) && p.dias_semana.length > 0
                ? p.dias_semana.map(d => DIAS[d]).join(', ') : null;
              return (
                <motion.div
                  key={p.id_programa}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  className="bg-[#181a20] rounded-2xl border border-gray-800 overflow-hidden flex flex-col hover:border-green-500/30 transition-colors"
                >
                  <div className="relative h-44 w-full bg-gradient-to-br from-gray-800 to-gray-900">
                    {p.imagen_url ? (
                      <Image src={p.imagen_url} alt={p.nombre} fill className="object-cover" sizes="(max-width:768px) 100vw, 33vw" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-700"><BookOpen size={40} /></div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-2">
                      {p.tipo && <span className="px-2 py-1 rounded-full text-xs font-bold uppercase bg-green-500/20 text-green-400 border border-green-500/30 backdrop-blur-md">{p.tipo}</span>}
                      {finalizado && <span className="px-2 py-1 rounded-full text-xs font-bold uppercase bg-red-500/20 text-red-400">Finalizado</span>}
                      {inscrito && <span className="px-2 py-1 rounded-full text-xs font-bold uppercase bg-purple-500/20 text-purple-300 flex items-center gap-1"><CheckCircle size={12} /> Inscrito</span>}
                    </div>
                  </div>

                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="text-lg font-bold mb-2">{p.nombre}</h3>
                    <div className="space-y-1.5 text-sm text-gray-400 mb-4 flex-1">
                      <div className="flex items-center gap-2"><Calendar size={15} className="text-green-400" />
                        {new Date(p.fecha_inicio + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – {new Date(p.fecha_fin + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      {dias && <div className="flex items-center gap-2"><Clock size={15} className="text-blue-400" />{dias}{p.hora_inicio ? ` · ${formatTime(p.hora_inicio)}` : ''}</div>}
                      {p.ubicacion && <div className="flex items-center gap-2"><MapPin size={15} className="text-red-400" />{p.ubicacion}</div>}
                      <div className="flex items-center gap-2"><Users size={15} className="text-gray-500" />{p.total_inscritos} inscrito(s) · {p.total_sesiones} sesión(es)</div>
                      {p.sesiones_requeridas_certificado > 0 && (
                        <div className="flex items-center gap-2"><Award size={15} className="text-yellow-400" />Certificado: {p.sesiones_requeridas_certificado}+ sesiones</div>
                      )}
                    </div>
                    <Button
                      onClick={() => handleParticipate(p)}
                      variant={inscrito ? 'secondary' : 'primary'}
                      disabled={isSubmitting || finalizado || inscrito}
                      className="w-full justify-center"
                    >
                      {inscrito ? 'Ya inscrito' : finalizado ? 'Finalizado' : 'Inscribirme'}
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal tipo de inscripción (invitado vs miembro) */}
      <Modal isOpen={showTypeModal} onClose={() => setShowTypeModal(false)} title="Confirmar Inscripción">
        <p className="text-gray-300 mb-6">¿Cómo deseas inscribirte a &quot;{selected?.nombre}&quot;?</p>
        <div className="space-y-3">
          <Button onClick={() => router.push(`/iniciar?redirect=/programas`)} variant="primary" className="w-full justify-center"><LogIn size={18} className="mr-2" />Soy miembro (Iniciar sesión)</Button>
          <Button onClick={() => { setShowTypeModal(false); setShowGuestModal(true); }} variant="secondary" className="w-full justify-center"><UserPlus size={18} className="mr-2" />Soy invitado</Button>
        </div>
      </Modal>

      {/* Modal invitado */}
      <Modal isOpen={showGuestModal} onClose={() => { setShowGuestModal(false); setFormErrors({}); }} title="Inscripción como Invitado">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
          <Input label="Nombre completo" value={guestData.nombre_completo} onChange={(e) => setGuestData({ ...guestData, nombre_completo: e.target.value })} error={formErrors.nombre_completo} />
          <Input label="Correo electrónico" type="email" value={guestData.correo_electronico} onChange={(e) => setGuestData({ ...guestData, correo_electronico: e.target.value })} error={formErrors.correo_electronico} />
          <Input label="Teléfono" value={guestData.numero_telefono} onChange={(e) => setGuestData({ ...guestData, numero_telefono: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10 dígitos" error={formErrors.numero_telefono} />
          <Select label="Carrera" value={guestData.carrera} onChange={(e) => setGuestData({ ...guestData, carrera: e.target.value })} options={carreras.map(c => ({ value: c, label: c }))} placeholder="Selecciona tu carrera" error={formErrors.carrera} />
          <Select label="Semestre" value={guestData.semestre} onChange={(e) => setGuestData({ ...guestData, semestre: e.target.value })} options={semestres} placeholder="Selecciona tu semestre" error={formErrors.semestre} />
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={() => { setShowGuestModal(false); setFormErrors({}); }} variant="secondary" disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={inscribirInvitado} variant="primary" disabled={isSubmitting}>{isSubmitting ? 'Inscribiendo...' : 'Confirmar Inscripción'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function ProgramasPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen text="Cargando programas..." />}>
      <ProgramasContent />
    </Suspense>
  );
}
