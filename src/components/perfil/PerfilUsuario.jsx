'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'react-toastify';
import {
  CalendarDays,
  Check,
  Code2,
  GraduationCap,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';

import { fetcher } from '@/lib/fetcher';
import { formatearFechaMedia } from '@/lib/fechas';
import { useAuth } from '@/context/AuthContext';
import { isStaffRole } from '@/lib/roles';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

/*
 * Vista única de "Mi perfil".
 *
 * Antes esto existía DOS veces: /dashboard (792 líneas) y /admin/perfil (691),
 * copias divergentes con el mismo estado, las mismas peticiones y los mismos
 * bugs. Cualquier corrección había que hacerla dos veces y nunca se hacía: la
 * validación del teléfono sólo existía en la copia del admin, y el badge de
 * participación era gris en una y rojo en la otra. Además /admin/perfil vivía
 * bajo un layout con ProtectedRoute adminOnly, así que un usuario normal era
 * expulsado de su propio perfil.
 *
 * Ahora hay un solo componente montado desde /perfil, accesible a cualquier
 * usuario autenticado (administrador incluido).
 */

const SEMESTRES = Array.from({ length: 14 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}° semestre`,
}));

/** Vista previa en texto de una descripción guardada como HTML. */
function textoPlano(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Estado real de la participación.
 *
 * La versión anterior sólo sabía decir PARTICIPÓ / NO PARTICIPÓ a partir de si
 * existía una fila de inscripción, así que un evento del mes que viene salía
 * marcado en rojo como "No participó" y quien se inscribió y nunca fue seguía
 * apareciendo como participante. Son cuatro estados distintos, no dos.
 */
function estadoParticipacion(ev) {
  if (ev.estado_evento === 'cancelado') return { label: 'Evento cancelado', tone: 'danger' };
  if (ev.estado_inscripcion === 'cancelada') return { label: 'Inscripción cancelada', tone: 'neutral' };
  if (!ev.finalizado) {
    if (!ev.inscrito) return { label: 'Próximo', tone: 'neutral' };
    return ev.en_curso ? { label: 'En curso', tone: 'info' } : { label: 'Inscrito', tone: 'info' };
  }
  if (ev.asistio) return { label: 'Asistió', tone: 'success' };
  if (ev.inscrito) return { label: 'No asistió', tone: 'warning' };
  return { label: 'No participaste', tone: 'neutral' };
}

const ESTADO_EVENTO = {
  planificacion: { label: 'En planificación', tone: 'neutral' },
  publicado: { label: 'Publicado', tone: 'info' },
  en_curso: { label: 'En curso', tone: 'success' },
  finalizado: { label: 'Finalizado', tone: 'neutral' },
  cancelado: { label: 'Cancelado', tone: 'danger' },
};

/** Del perfil que devuelve el servidor al estado del formulario. */
function formularioDesdePerfil(p) {
  return {
    nombre_completo: p.nombre_completo || '',
    numero_telefono: p.numero_telefono || '',
    semestre: p.semestre ? String(p.semestre) : '',
    id_carrera: p.id_carrera ? String(p.id_carrera) : '',
    es_club_programacion: !!p.es_club_programacion,
    es_computer_society: !!p.es_computer_society,
    numero_ieee: p.numero_ieee || '',
    usuario_codeforces: p.usuario_codeforces || '',
    usuario_vjudge: p.usuario_vjudge || '',
    usuario_omegaup: p.usuario_omegaup || '',
  };
}

export default function PerfilUsuario() {
  const { user, logout, updateUser } = useAuth();
  const [pestana, setPestana] = useState('eventos');
  const [modoEdicion, setModoEdicion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  // El formulario sólo existe mientras se edita: así no hay ningún efecto que
  // lo re-sincronice (y pise lo que el usuario está escribiendo) cada vez que
  // SWR revalida el perfil.
  const [formulario, setFormulario] = useState(null);
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // SWR en lugar del useEffect con `user` en las dependencias que tenía la
  // versión anterior: aquel se re-disparaba en cuanto updateUser creaba un
  // objeto nuevo, así que las tres peticiones iniciales salían por duplicado.
  const {
    data: perfilResp,
    error: errorPerfil,
    isLoading: cargandoPerfil,
    mutate: refrescarPerfil,
  } = useSWR('/api/user/profile', fetcher, { revalidateOnFocus: false });

  const { data: eventos, isLoading: cargandoEventos } = useSWR('/api/user/events', fetcher, {
    revalidateOnFocus: false,
  });

  // El catálogo sólo hace falta al editar; y sale de la MISMA tabla contra la
  // que se guarda, que es lo que evita el "guardado" silencioso de antes.
  const { data: carrerasResp } = useSWR(
    pestana === 'perfil' ? '/api/user/carreras' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  // Sólo quien tiene rol de staff puede estar asignado a un evento (asignar
  // staff_evento promueve el rol del miembro), así que no se lanza esta
  // consulta —cinco JOINs y dos COUNT DISTINCT— para el 100% de los usuarios.
  const esStaff = isStaffRole(user?.role);
  const { data: eventosStaff } = useSWR(esStaff ? '/api/staff/eventos' : null, fetcher, {
    revalidateOnFocus: false,
  });

  const perfil = perfilResp?.user || null;
  const listaEventos = Array.isArray(eventos) ? eventos : [];
  const listaStaff = Array.isArray(eventosStaff) ? eventosStaff : [];
  const carreras = carrerasResp?.carreras || [];

  const empezarEdicion = () => {
    setFormulario(formularioDesdePerfil(perfil || {}));
    setModoEdicion(true);
  };

  // Mantiene el nombre del encabezado del sitio en sincronía con la ficha.
  useEffect(() => {
    if (perfil) updateUser(perfil);
  }, [perfil, updateUser]);

  const guardarPerfil = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formulario,
          // El servidor espera el id del catálogo; '' significa "no tocar".
          id_carrera: formulario.id_carrera || '',
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data.error || 'No se pudo actualizar el perfil');
        return;
      }

      // Se pinta lo que el servidor GUARDÓ, no lo que se escribió: si pegaste
      // la URL de tu perfil de Codeforces, aquí ya viene sólo el handle. Antes
      // la pantalla mostraba la URL hasta que recargabas y "se deshacía" sola.
      if (data.user) {
        updateUser(data.user);
        refrescarPerfil({ success: true, user: data.user }, { revalidate: false });
      }
      setModoEdicion(false);
      setFormulario(null);
      toast.success(data.message || 'Perfil actualizado correctamente');
    } catch {
      toast.error('Error de conexión con el servidor');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarPassword = async (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setCambiandoPassword(true);
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || 'No se pudo cambiar la contraseña');
        return;
      }
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success(data.message || 'Contraseña actualizada correctamente');
    } catch {
      toast.error('Error de conexión con el servidor');
    } finally {
      setCambiandoPassword(false);
    }
  };

  const pestanas = [
    { id: 'eventos', label: 'Mis eventos', icon: CalendarDays },
    { id: 'perfil', label: 'Datos personales', icon: User },
    { id: 'seguridad', label: 'Seguridad', icon: Lock },
    ...(listaStaff.length > 0
      ? [{ id: 'staff', label: 'Eventos como staff', icon: ShieldCheck, contador: listaStaff.length }]
      : []),
  ];

  const nombre = perfil?.nombre_completo || user?.nombre_completo || user?.name || '';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-28 pb-16">
      <PageHeader
        title="Mi perfil"
        description={nombre ? `Sesión iniciada como ${nombre}` : 'Tu información en Crocoders'}
        actions={
          <Button variant="ghost" color="red" onClick={() => logout()}>
            <LogOut size={16} aria-hidden="true" />
            Cerrar sesión
          </Button>
        }
      />

      {errorPerfil && (
        <Card className="mb-6 border-danger/30 bg-danger-soft">
          <p className="text-sm text-danger">
            No pudimos cargar tu perfil. Revisa tu conexión y vuelve a intentarlo.
          </p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => refrescarPerfil()}>
            Reintentar
          </Button>
        </Card>
      )}

      {/* Navegación por pestañas: sustituye a la barra lateral que duplicaba el
          menú del sitio y ocupaba un tercio del ancho sin aportar nada. */}
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-line" aria-label="Secciones del perfil">
        {pestanas.map(({ id, label, icon: Icon, contador }) => {
          const activa = pestana === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPestana(id)}
              aria-current={activa ? 'page' : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                activa
                  ? 'border-brand text-fg'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
              {contador != null && (
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted tabular-nums">
                  {contador}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {pestana === 'eventos' && (
        <SeccionEventos eventos={listaEventos} cargando={cargandoEventos} />
      )}

      {pestana === 'perfil' && (
        <SeccionDatos
          perfil={perfil}
          cargando={cargandoPerfil}
          modoEdicion={modoEdicion}
          onEditar={empezarEdicion}
          formulario={formulario}
          setFormulario={setFormulario}
          carreras={carreras}
          guardando={guardando}
          onSubmit={guardarPerfil}
          onCancelar={() => {
            setModoEdicion(false);
            setFormulario(null);
          }}
        />
      )}

      {pestana === 'seguridad' && (
        <SeccionSeguridad
          passwords={passwords}
          setPasswords={setPasswords}
          enviando={cambiandoPassword}
          onSubmit={cambiarPassword}
        />
      )}

      {pestana === 'staff' && <SeccionStaff eventos={listaStaff} />}
    </div>
  );
}

/* ------------------------------------------------------------------ eventos */

function SeccionEventos({ eventos, cargando }) {
  const router = useRouter();

  if (cargando) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-3 h-3 w-1/4" />
          </Card>
        ))}
      </div>
    );
  }

  if (eventos.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Todavía no hay nada en tu historial"
        description="Cuando te inscribas a un evento aparecerá aquí, junto con tu asistencia."
        action={
          <Button size="sm" onClick={() => router.push('/eventos')}>
            Ver eventos abiertos
          </Button>
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {eventos.map((ev) => {
        const estado = estadoParticipacion(ev);
        return (
          <li key={ev.id_evento}>
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-fg">{ev.nombre}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={13} aria-hidden="true" />
                    {formatearFechaMedia(ev.fecha)}
                  </span>
                  {ev.tipo && <span>{ev.tipo}</span>}
                  {ev.ubicacion && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={13} aria-hidden="true" />
                      {ev.ubicacion}
                    </span>
                  )}
                </div>
              </div>
              <Badge tone={estado.tone} className="shrink-0 self-start sm:self-center">
                {estado.label}
              </Badge>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------- perfil */

function Dato({ icon: Icon, etiqueta, valor }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-faint">
        {Icon && <Icon size={13} aria-hidden="true" />}
        {etiqueta}
      </p>
      <p className="mt-1 text-sm text-fg">{valor || 'No registrado'}</p>
    </div>
  );
}

function Casilla({ id, checked, onChange, children }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-fg">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong bg-surface-2 accent-brand"
      />
      <span>{children}</span>
    </label>
  );
}

function SeccionDatos({
  perfil,
  cargando,
  modoEdicion,
  onEditar,
  formulario,
  setFormulario,
  carreras,
  guardando,
  onSubmit,
  onCancelar,
}) {
  if (cargando && !perfil) {
    return (
      <Card>
        <Skeleton className="h-4 w-40" />
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-4 w-40" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!perfil) return null;

  const cambiar = (campo) => (e) =>
    setFormulario((prev) => ({ ...prev, [campo]: e.target.value }));

  const alternar = (campo) => (e) =>
    setFormulario((prev) => ({ ...prev, [campo]: e.target.checked }));

  if (!modoEdicion || !formulario) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="text-sm font-semibold text-fg">Información personal</h2>
            <Button size="sm" variant="secondary" onClick={onEditar}>
              <Pencil size={14} aria-hidden="true" />
              Editar
            </Button>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Dato icon={User} etiqueta="Nombre completo" valor={perfil.nombre_completo} />
            <Dato icon={Mail} etiqueta="Correo electrónico" valor={perfil.email} />
            <Dato icon={Phone} etiqueta="Teléfono" valor={perfil.numero_telefono} />
            <Dato
              icon={GraduationCap}
              etiqueta="Semestre"
              valor={perfil.semestre ? `${perfil.semestre}° semestre` : ''}
            />
            <Dato etiqueta="Carrera" valor={perfil.carrera} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-fg">Afiliación</h2>
          <div className="flex flex-wrap items-center gap-2">
            {perfil.es_club_programacion && <Badge tone="success">Club de Programación</Badge>}
            {perfil.es_computer_society && <Badge tone="info">IEEE Computer Society</Badge>}
            {!perfil.es_club_programacion && !perfil.es_computer_society && (
              <p className="text-sm text-muted">Sin afiliación registrada.</p>
            )}
          </div>
          {perfil.es_computer_society && (
            <p className="mt-3 text-xs text-muted">
              Número IEEE: <span className="font-mono text-fg">{perfil.numero_ieee || 'pendiente'}</span>
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg">
            <Code2 size={15} aria-hidden="true" />
            Cuentas de plataformas
          </h2>
          <div className="grid gap-5 sm:grid-cols-3">
            <Dato etiqueta="Codeforces" valor={perfil.usuario_codeforces} />
            <Dato etiqueta="OmegaUp" valor={perfil.usuario_omegaup} />
            <Dato etiqueta="VJudge" valor={perfil.usuario_vjudge} />
          </div>
          <p className="mt-4 text-xs text-faint">
            Estos usuarios alimentan la tabla de posiciones. Si los cambias, tus estadísticas se
            vuelven a sincronizar desde cero.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <h2 className="mb-5 text-sm font-semibold text-fg">Información personal</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre completo"
            wrapperClassName="sm:col-span-2"
            value={formulario.nombre_completo}
            onChange={cambiar('nombre_completo')}
            required
            maxLength={200}
            help="Escribe nombre y apellido: el apellido se guarda por separado."
          />
          <Input
            label="Teléfono"
            type="tel"
            inputMode="numeric"
            value={formulario.numero_telefono}
            onChange={cambiar('numero_telefono')}
            maxLength={15}
            help="Entre 10 y 15 dígitos, sin espacios. Déjalo vacío para borrarlo."
          />
          <Select
            label="Semestre"
            value={formulario.semestre}
            onChange={cambiar('semestre')}
            options={SEMESTRES}
            placeholder="Selecciona tu semestre"
            required
          />
          {/* Mientras el catálogo no ha llegado, el <select> se deja
              DESHABILITADO a propósito. Con `required` y sin la opción que
              corresponde al valor actual, el navegador ve el campo vacío y
              bloquea el envío con un "Selecciona un elemento de la lista" que
              apunta a un desplegable que aún no tiene nada dentro; un control
              deshabilitado queda fuera de la validación nativa y el id que ya
              estaba en la ficha se guarda igualmente. */}
          <Select
            label="Carrera"
            wrapperClassName="sm:col-span-2"
            value={formulario.id_carrera}
            onChange={cambiar('id_carrera')}
            options={carreras.map((c) => ({ value: String(c.id_carrera), label: c.nombre }))}
            placeholder={carreras.length ? 'Selecciona tu carrera' : 'Cargando carreras…'}
            required
            disabled={carreras.length === 0}
          />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-fg">Afiliación</h2>
        <p className="mb-4 text-xs text-muted">
          Puedes pertenecer a los dos. Si entras al capítulo más adelante, actualízalo aquí sin
          tener que pedírselo a un administrador.
        </p>
        <div className="space-y-3">
          <Casilla
            id="afiliacion-club"
            checked={formulario.es_club_programacion}
            onChange={alternar('es_club_programacion')}
          >
            Club de Programación
          </Casilla>
          <Casilla
            id="afiliacion-cs"
            checked={formulario.es_computer_society}
            onChange={alternar('es_computer_society')}
          >
            IEEE Computer Society
          </Casilla>
        </div>
        {formulario.es_computer_society && (
          <Input
            label="Número IEEE"
            wrapperClassName="mt-4 max-w-xs"
            value={formulario.numero_ieee}
            onChange={cambiar('numero_ieee')}
            inputMode="numeric"
            maxLength={20}
            required
            help="Solo dígitos. Es obligatorio para pertenecer al capítulo."
          />
        )}
      </Card>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
          <Code2 size={15} aria-hidden="true" />
          Cuentas de plataformas
        </h2>
        <p className="mb-4 text-xs text-muted">
          Puedes pegar la URL de tu perfil: guardamos solo el nombre de usuario.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Codeforces"
            placeholder="usuario"
            value={formulario.usuario_codeforces}
            onChange={cambiar('usuario_codeforces')}
          />
          <Input
            label="OmegaUp"
            placeholder="usuario"
            value={formulario.usuario_omegaup}
            onChange={cambiar('usuario_omegaup')}
          />
          <Input
            label="VJudge"
            placeholder="usuario"
            value={formulario.usuario_vjudge}
            onChange={cambiar('usuario_vjudge')}
          />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button type="submit" loading={guardando}>
          {!guardando && <Check size={16} aria-hidden="true" />}
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- seguridad */

function SeccionSeguridad({ passwords, setPasswords, enviando, onSubmit }) {
  const cambiar = (campo) => (e) =>
    setPasswords((prev) => ({ ...prev, [campo]: e.target.value }));

  return (
    <Card className="max-w-lg">
      <h2 className="mb-1 text-sm font-semibold text-fg">Cambiar contraseña</h2>
      <p className="mb-5 text-xs text-muted">
        Las sesiones abiertas en otros dispositivos seguirán activas hasta que caduquen.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          value={passwords.currentPassword}
          onChange={cambiar('currentPassword')}
          required
        />
        <Input
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          value={passwords.newPassword}
          onChange={cambiar('newPassword')}
          required
          minLength={8}
          help="Mínimo 8 caracteres."
        />
        <Input
          label="Confirmar nueva contraseña"
          type="password"
          autoComplete="new-password"
          value={passwords.confirmPassword}
          onChange={cambiar('confirmPassword')}
          required
          minLength={8}
        />
        <div className="pt-1">
          <Button type="submit" loading={enviando}>
            {!enviando && <Lock size={16} aria-hidden="true" />}
            Actualizar contraseña
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------------- staff */

function SeccionStaff({ eventos }) {
  const router = useRouter();

  if (eventos.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No estás asignado como staff"
        description="Cuando te asignen a un evento aparecerá aquí con sus herramientas de asistencia."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          Eventos donde apoyas como staff. El pase de lista está en el panel de staff.
        </p>
        <Button size="sm" variant="secondary" onClick={() => router.push('/staff')}>
          Abrir panel de staff
        </Button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {eventos.map((ev) => {
          const estado = ESTADO_EVENTO[ev.estado] || ESTADO_EVENTO.planificacion;
          const resumen = textoPlano(ev.descripcion);
          return (
            <li key={ev.id_evento}>
              <Card className="h-full">
                <div className="flex items-start justify-between gap-3">
                  {/* Antes esto leía `event.titulo`, un campo que la API nunca
                      devolvió: la tarjeta salía literalmente sin título. */}
                  <h3 className="text-sm font-semibold text-fg">{ev.nombre}</h3>
                  <Badge tone={estado.tone} className="shrink-0">{estado.label}</Badge>
                </div>

                {resumen && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted">{resumen}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={13} aria-hidden="true" />
                    {formatearFechaMedia(ev.fecha_inicio)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck size={13} aria-hidden="true" />
                    {ev.mi_rol}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users size={13} aria-hidden="true" />
                    {ev.total_asistieron || 0} de {ev.total_inscritos || 0} asistieron
                  </span>
                </div>

                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => router.push(`/staff/eventos/${ev.id_evento}`)}
                  >
                    Ver detalles
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
