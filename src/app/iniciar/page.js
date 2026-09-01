'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  User,
  Mail,
  Phone,
  Check,
  X,
  Shield,
  ArrowLeft,
  ArrowRight,
  Info,
  Trophy,
  BadgeCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import PasswordField, { fuerzaContrasena, FUERZA_MINIMA } from './components/PasswordField';
import styles from './page.module.css';

/* ---------------------------------------------------------------------------
   Datos fijos, fuera del componente para no recrearlos en cada render.
--------------------------------------------------------------------------- */

const CARRERAS = [
  'Ingeniería en Sistemas Computacionales',
  'Ingeniería en Electrónica',
  'Ingeniería Industrial',
  'Ingeniería Química',
  'Ingeniería en Logística',
  'Ingeniería en Mecatrónica',
  'Otra',
];

// La BD acepta 1..14 (miembro_semestre_actual_check) y el servidor valida
// min(1).max(14). El desplegable ofrecía solo 1..10, así que un alumno de 11º
// o más tenía que declarar un semestre falso.
const SEMESTRES = Array.from({ length: 14 }, (_, i) => String(i + 1));

const PASOS = [
  { numero: 1, etiqueta: 'Afiliación' },
  { numero: 2, etiqueta: 'Datos personales' },
  { numero: 3, etiqueta: 'Cuenta y perfiles' },
];

const PLATAFORMAS = [
  { campo: 'usuario_codeforces', etiqueta: 'Codeforces', placeholder: 'tu usuario en Codeforces' },
  { campo: 'usuario_vjudge', etiqueta: 'VJudge', placeholder: 'tu usuario en VJudge' },
  { campo: 'usuario_omegaup', etiqueta: 'OmegaUp', placeholder: 'tu usuario en omegaUp' },
];

const DATOS_REGISTRO_INICIALES = {
  nombre: '',
  apellido_paterno: '',
  apellido_materno: '',
  correo_electronico: '',
  contrasena: '',
  confirmar_contrasena: '',
  numero_telefono: '',
  usuario_codeforces: '',
  usuario_vjudge: '',
  usuario_omegaup: '',
  semestre: '',
  carrera: '',
  // `carreraEsOtra` vive dentro del formulario a propósito: cuando era un
  // useState aparte, resetForm() no lo tocaba y el desplegable se quedaba
  // clavado en "Otra" después de un alta correcta.
  carreraEsOtra: false,
  es_computer_society: false,
  es_club_programacion: false,
  numero_ieee: '',
};

const validarEmail = (valor) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor).toLowerCase());
const validarTelefono = (valor) => /^[0-9]{10,15}$/.test(valor);

/** Banda de mensaje (error, éxito o información) con el mismo tono en todas las vistas. */
function Aviso({ tipo = 'error', icono, children }) {
  const clase =
    tipo === 'exito' ? styles.avisoExito : tipo === 'info' ? styles.avisoInfo : styles.avisoError;
  return (
    <div className={`${styles.aviso} ${clase}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <span className={styles.avisoIcono}>{icono}</span>
      <span>{children}</span>
    </div>
  );
}

function AuthContent() {
  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Registro
  const [registerData, setRegisterData] = useState(DATOS_REGISTRO_INICIALES);
  const [paso, setPaso] = useState(1);
  const [pasoMaximo, setPasoMaximo] = useState(1);

  // Recuperación
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [tokenVerified, setTokenVerified] = useState(false);
  const [sessionToken, setSessionToken] = useState('');

  // Vistas y mensajes
  const [view, setView] = useState('auth');
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  const searchParams = useSearchParams();
  const { user, loading, login, register } = useAuth();
  const tarjetaRef = useRef(null);

  const registerEvent = searchParams.get('registerEvent');

  // Inscribe al evento pendiente después de autenticarse. No se memoriza para
  // no entrar en el array de deps del useEffect; el ref garantiza un solo
  // disparo por sesión.
  const postLoginHandledRef = useRef(false);

  const handlePostLoginRegistration = async (eventId, currentUser) => {
    try {
      if (!currentUser?.id) {
        throw new Error('Usuario no autenticado correctamente');
      }

      const response = await fetch('/api/eventos/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventoId: eventId,
          userId: currentUser.id,
          tipo: 'miembro',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al registrar');
      }

      const fromPath = searchParams.get('from') || '/eventos';
      window.location.href = `${fromPath}?registered=true&eventId=${eventId}`;
    } catch (error) {
      console.error('Error al registrar en evento:', error);
      // Sin router.push: competía con el window.location.href del camino
      // correcto y provocaba dos navegaciones peleándose.
      toast.error(`Error al registrar: ${error.message}`);
    }
  };

  useEffect(() => {
    const recoveryParam = searchParams.get('recovery');

    if (recoveryParam) {
      setView('recovery');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (registerEvent && user && !loading && !postLoginHandledRef.current) {
      postLoginHandledRef.current = true;
      handlePostLoginRegistration(registerEvent, user);
    }
    // handlePostLoginRegistration es estable; el ref evita el doble disparo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, loading, registerEvent]);

  /* -------------------------------------------------------------------------
     Navegación entre vistas y pasos
  ------------------------------------------------------------------------- */

  // Cambiar de vista tiene que limpiar los mensajes: si no, el "Credenciales
  // inválidas" del login seguía visible dentro de "Recuperar contraseña".
  const goToView = (siguiente) => {
    setErrors({});
    setSuccessMessage('');
    if (siguiente === 'auth' || siguiente === 'recovery') {
      // Una recuperación abandonada no debe dejar vivo su token de sesión.
      // Volver a "recovery" es "cambiar de correo": el código y el token del
      // correo anterior ya no sirven y arrastrarlos solo produce un fallo de
      // verificación confuso.
      setVerificationCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSessionToken('');
      setTokenVerified(false);
    }
    setView(siguiente);
  };

  const cambiarPestana = (aLogin) => {
    setIsLogin(aLogin);
    setErrors({});
    setSuccessMessage('');
  };

  const irAlInicioDeLaTarjeta = () => {
    tarjetaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const resetForm = () => {
    setRegisterData(DATOS_REGISTRO_INICIALES);
    setErrors({});
    setPaso(1);
    setPasoMaximo(1);
  };

  /* -------------------------------------------------------------------------
     Validación por pasos
  ------------------------------------------------------------------------- */

  const validarPaso = (numero) => {
    const e = {};
    const d = registerData;

    if (numero === 1) {
      if (!d.es_club_programacion && !d.es_computer_society) {
        e.afiliacion = 'Elige al menos una opción para continuar.';
      }
    }

    if (numero === 2) {
      if (!d.nombre.trim()) e.nombre = 'Escribe tu nombre';
      if (!d.apellido_paterno.trim()) e.apellido_paterno = 'Escribe tu apellido paterno';
      if (!d.correo_electronico.trim()) {
        e.correo_electronico = 'Escribe tu correo';
      } else if (!validarEmail(d.correo_electronico)) {
        e.correo_electronico = 'Ese correo no parece válido';
      }
      if (!d.numero_telefono.trim()) {
        e.numero_telefono = 'Escribe tu teléfono';
      } else if (!validarTelefono(d.numero_telefono)) {
        e.numero_telefono = 'Deben ser entre 10 y 15 dígitos, sin espacios';
      }
      if (!d.semestre) e.semestre = 'Elige tu semestre';
      if (!d.carrera.trim()) e.carrera = 'Indica tu carrera';
    }

    if (numero === 3) {
      if (!d.contrasena) {
        e.contrasena = 'Escribe una contraseña';
      } else if (d.contrasena.length < 8) {
        e.contrasena = 'Debe tener al menos 8 caracteres';
      } else if (fuerzaContrasena(d.contrasena) < FUERZA_MINIMA) {
        // Misma regla que el restablecimiento: antes se podía crear una cuenta
        // con una contraseña que luego el propio sitio rechazaba.
        e.contrasena = 'Añade mayúsculas, números o símbolos: aún es fácil de adivinar';
      }
      if (!d.confirmar_contrasena) {
        e.confirmar_contrasena = 'Repite la contraseña';
      } else if (d.contrasena !== d.confirmar_contrasena) {
        e.confirmar_contrasena = 'Las contraseñas no coinciden';
      }

      if (d.es_club_programacion) {
        const algunPerfil = PLATAFORMAS.some(({ campo }) => d[campo].trim());
        if (!algunPerfil) {
          e.plataformas = 'Indica al menos un perfil para poder puntuar tu progreso.';
        }
      }

      if (d.es_computer_society) {
        if (!d.numero_ieee.trim()) {
          e.numero_ieee = 'El número IEEE es obligatorio para el Capítulo';
        } else if (!/^\d+$/.test(d.numero_ieee)) {
          e.numero_ieee = 'El número IEEE solo puede contener dígitos';
        }
      }
    }

    return e;
  };

  const avanzarPaso = () => {
    const e = validarPaso(paso);
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const siguiente = Math.min(paso + 1, PASOS.length);
    setPaso(siguiente);
    setPasoMaximo((max) => Math.max(max, siguiente));
    irAlInicioDeLaTarjeta();
  };

  const retrocederPaso = () => {
    // Volver nunca valida ni borra: los datos escritos siguen en el estado.
    setErrors({});
    setPaso((p) => Math.max(1, p - 1));
    irAlInicioDeLaTarjeta();
  };

  const irAPaso = (numero) => {
    if (numero > pasoMaximo) return;
    setErrors({});
    setPaso(numero);
  };

  /* -------------------------------------------------------------------------
     Cambios de campo
  ------------------------------------------------------------------------- */

  const limpiarError = (...claves) => {
    setErrors((prev) => {
      const siguiente = { ...prev };
      claves.forEach((clave) => delete siguiente[clave]);
      delete siguiente.general;
      return siguiente;
    });
  };

  const handleRegisterChange = (e) => {
    const { name, value } = e.target;

    // El número IEEE solo admite dígitos: se filtra al teclear en vez de
    // esperar al envío.
    if (name === 'numero_ieee' && !/^\d*$/.test(value)) return;

    setRegisterData((prev) => ({ ...prev, [name]: value }));
    // Los tres perfiles comparten un único error ("indica al menos uno"), así
    // que escribir en cualquiera de ellos lo retira.
    if (name.startsWith('usuario_')) limpiarError(name, 'plataformas');
    else limpiarError(name);
  };

  const handleCarreraChange = (e) => {
    const valor = e.target.value;
    if (valor === 'Otra') {
      setRegisterData((prev) => ({ ...prev, carreraEsOtra: true, carrera: '' }));
    } else {
      setRegisterData((prev) => ({ ...prev, carreraEsOtra: false, carrera: valor }));
    }
    limpiarError('carrera');
  };

  const toggleAfiliacion = (campo) => {
    setRegisterData((prev) => ({ ...prev, [campo]: !prev[campo] }));
    limpiarError('afiliacion');
  };

  /* -------------------------------------------------------------------------
     Envíos
  ------------------------------------------------------------------------- */

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoading) return; // corta el doble envío por doble clic
    setErrors({});
    setIsLoading(true);

    try {
      if (!email || !password) {
        throw new Error('Escribe tu correo y tu contraseña');
      }

      if (!validarEmail(email)) {
        throw new Error('Ese correo no parece válido');
      }

      const result = await login(email, password);

      setSuccessMessage('');

      if (!result.success) {
        throw new Error(result.error || 'Contraseña incorrecta o usuario no encontrado');
      }

      toast.success('¡Inicio de sesión exitoso! Redirigiendo...');

      if (registerEvent) {
        // Marcar ANTES de llamar: login() actualiza el usuario del contexto y
        // eso vuelve a ejecutar el useEffect de arriba, que disparaba una
        // segunda inscripción al mismo evento en paralelo.
        postLoginHandledRef.current = true;
        await handlePostLoginRegistration(registerEvent, result.user);
      } else {
        const redirectPath =
          result.redirectTo || (result.user?.role === 'administrador' ? '/admin' : '/dashboard');
        window.location.href = redirectPath;
      }
    } catch (err) {
      setErrors({ general: err.message });
      toast.error(err.message || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    // Enter en un paso intermedio significa "continuar", no "enviar".
    if (paso < PASOS.length) {
      avanzarPaso();
      return;
    }

    // Revalidación completa: si el usuario retrocedió y vació algo, el envío
    // lo devuelve al paso culpable en lugar de fallar en el servidor.
    for (const { numero } of PASOS) {
      const erroresPaso = validarPaso(numero);
      if (Object.keys(erroresPaso).length > 0) {
        setErrors(erroresPaso);
        setPaso(numero);
        irAlInicioDeLaTarjeta();
        return;
      }
    }

    setIsLoading(true);
    setErrors({});

    try {
      const d = registerData;
      // Payload explícito: `carreraEsOtra` es estado de la interfaz y no debe
      // viajar al servidor. Los perfiles solo se envían si el usuario es del
      // Club, y el número IEEE solo si es del Capítulo.
      const payload = {
        nombre: d.nombre.trim(),
        apellido_paterno: d.apellido_paterno.trim(),
        apellido_materno: d.apellido_materno.trim(),
        correo_electronico: d.correo_electronico.trim(),
        contrasena: d.contrasena,
        confirmar_contrasena: d.confirmar_contrasena,
        numero_telefono: d.numero_telefono.trim(),
        semestre: d.semestre,
        carrera: d.carrera.trim(),
        es_club_programacion: d.es_club_programacion,
        es_computer_society: d.es_computer_society,
        numero_ieee: d.es_computer_society ? d.numero_ieee.trim() : null,
        usuario_codeforces: d.es_club_programacion ? d.usuario_codeforces.trim() : '',
        usuario_vjudge: d.es_club_programacion ? d.usuario_vjudge.trim() : '',
        usuario_omegaup: d.es_club_programacion ? d.usuario_omegaup.trim() : '',
      };

      const result = await register(payload);

      if (!result.success) {
        throw new Error(result.error || 'Error al registrarse');
      }

      toast.success(result.message || '¡Registro exitoso! Por favor inicia sesión.');
      resetForm();

      if (result.user) {
        if (registerEvent) {
          postLoginHandledRef.current = true;
          await handlePostLoginRegistration(registerEvent, result.user);
        } else {
          window.location.href = result.redirectTo || '/dashboard';
        }
      } else {
        // Alta correcta pero hace falta iniciar sesión a mano.
        setIsLogin(true);
        setSuccessMessage('¡Cuenta creada! Ya puedes iniciar sesión.');

        if (registerEvent) {
          toast.info('Inicia sesión para completar tu registro al evento');
        }
      }
    } catch (err) {
      toast.error(err.message || 'Error al registrarse');
      setErrors({ general: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecoveryRequest = async (e) => {
    e?.preventDefault?.();
    if (isLoading) return;
    setErrors({});

    if (!recoveryEmail) {
      setErrors({ recoveryEmail: 'Escribe tu correo' });
      return;
    }

    if (!validarEmail(recoveryEmail)) {
      setErrors({ recoveryEmail: 'Ese correo no parece válido' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al solicitar recuperación');
      }

      // El servidor responde igual exista o no la cuenta (para no filtrar qué
      // correos están registrados). Por eso el mensaje es condicional: decir
      // "se ha enviado un correo" era una promesa que el servidor no hace.
      toast.info(data.message || 'Si la cuenta existe, recibirás un código en unos minutos.');
      setErrors({});
      setView('verify-code');
    } catch (error) {
      toast.error(error.message || 'Error al solicitar recuperación');
      setErrors({ general: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setErrors({});

    if (!verificationCode || !/^\d{6}$/.test(verificationCode)) {
      setErrors({ verificationCode: 'El código son 6 dígitos' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail, verificationCode }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'El código es inválido o ha expirado');
      }

      setSessionToken(data.sessionToken);
      setTokenVerified(true);
      setErrors({});
      setView('reset');
      toast.success('Código verificado. Ahora crea tu nueva contraseña.');
    } catch (error) {
      toast.error(error.message || 'Error al verificar el código');
      setErrors({ verificationCode: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setErrors({});

    const erroresReset = {};
    if (!newPassword) {
      erroresReset.newPassword = 'Escribe la nueva contraseña';
    } else if (newPassword.length < 8) {
      erroresReset.newPassword = 'Debe tener al menos 8 caracteres';
    } else if (fuerzaContrasena(newPassword) < FUERZA_MINIMA) {
      erroresReset.newPassword = 'Añade mayúsculas, números o símbolos: aún es fácil de adivinar';
    }
    if (!confirmNewPassword) {
      erroresReset.confirmNewPassword = 'Repite la nueva contraseña';
    } else if (newPassword !== confirmNewPassword) {
      erroresReset.confirmNewPassword = 'Las contraseñas no coinciden';
    }

    if (Object.keys(erroresReset).length > 0) {
      setErrors(erroresReset);
      return;
    }

    setIsLoading(true);
    try {
      const resetResponse = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ newPassword, email: recoveryEmail }),
      });

      const resetData = await resetResponse.json();

      if (!resetResponse.ok) {
        throw new Error(resetData.error || 'Error al restablecer contraseña');
      }

      const loginResponse = await login(recoveryEmail, newPassword);

      if (!loginResponse.success) {
        throw new Error(
          loginResponse.error || 'Contraseña actualizada pero falló el inicio de sesión automático'
        );
      }

      toast.success('¡Contraseña actualizada! Iniciando sesión...');

      if (registerEvent) {
        postLoginHandledRef.current = true;
        await handlePostLoginRegistration(registerEvent, loginResponse.user);
      } else {
        window.location.href = searchParams.get('from') || '/dashboard';
      }
    } catch (error) {
      toast.error(error.message || 'Error al restablecer contraseña');
      setErrors({ general: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  /* -------------------------------------------------------------------------
     Piezas de interfaz
  ------------------------------------------------------------------------- */

  const renderStepper = () => (
    <nav className={styles.stepper} aria-label="Progreso del registro">
      {PASOS.map(({ numero, etiqueta }, indice) => {
        const completado = numero < paso;
        const actual = numero === paso;
        const accesible = numero <= pasoMaximo && numero !== paso;
        return (
          <div
            key={numero}
            className={`${styles.stepItem} ${completado ? styles.stepDone : ''} ${
              actual ? styles.stepCurrent : ''
            }`}
          >
            <button
              type="button"
              className={styles.stepButton}
              data-clickable={accesible ? 'true' : 'false'}
              onClick={() => accesible && irAPaso(numero)}
              aria-current={actual ? 'step' : undefined}
              aria-label={`Paso ${numero} de ${PASOS.length}: ${etiqueta}`}
            >
              <span className={styles.stepDot} aria-hidden="true">
                {completado ? <Check size={14} /> : numero}
              </span>
              <span className={styles.stepLabel}>{etiqueta}</span>
            </button>
            {indice < PASOS.length - 1 && (
              <span
                className={`${styles.stepLine} ${completado ? styles.stepLineDone : ''}`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </nav>
  );

  const renderPasoAfiliacion = () => (
    <div className={styles.form}>
      <div>
        <h3 className={styles.seccionTitulo}>¿Con quién participas?</h3>
        <p className={styles.introTexto}>
          Puedes marcar las dos si perteneces a ambas. Según lo que elijas te
          pediremos unos datos u otros.
        </p>
      </div>

      {errors.afiliacion && (
        <Aviso icono={<X size={16} />}>{errors.afiliacion}</Aviso>
      )}

      <div className={styles.afiliacionGrid} role="group" aria-label="Afiliación">
        <button
          type="button"
          onClick={() => toggleAfiliacion('es_club_programacion')}
          aria-pressed={registerData.es_club_programacion}
          className={`${styles.afiliacionCard} ${
            registerData.es_club_programacion ? styles.afiliacionCardActiva : ''
          }`}
        >
          <span className={styles.afiliacionCheck} aria-hidden="true">
            <Check size={14} />
          </span>
          <Trophy size={22} className={styles.afiliacionIcono} aria-hidden="true" />
          <span className={styles.afiliacionTitulo}>Club de Programación</span>
          <span className={styles.afiliacionTexto}>
            Algoritmia y programación competitiva. Te pediremos tus perfiles en
            las plataformas de práctica.
          </span>
        </button>

        <button
          type="button"
          onClick={() => toggleAfiliacion('es_computer_society')}
          aria-pressed={registerData.es_computer_society}
          className={`${styles.afiliacionCard} ${
            registerData.es_computer_society ? styles.afiliacionCardActiva : ''
          }`}
        >
          <span className={styles.afiliacionCheck} aria-hidden="true">
            <Check size={14} />
          </span>
          <BadgeCheck size={22} className={styles.afiliacionIcono} aria-hidden="true" />
          <span className={styles.afiliacionTitulo}>Capítulo Computer Society</span>
          <span className={styles.afiliacionTexto}>
            Capítulo estudiantil IEEE. Te pediremos tu número de miembro IEEE.
          </span>
        </button>
      </div>
    </div>
  );

  const renderPasoDatos = () => (
    <div className={styles.form}>
      <Input
        label="Nombre"
        name="nombre"
        value={registerData.nombre}
        onChange={handleRegisterChange}
        error={errors.nombre}
        icon={<User size={16} />}
        placeholder="Juan"
        autoComplete="given-name"
        required
      />

      <div className={styles.grid}>
        <Input
          label="Apellido paterno"
          name="apellido_paterno"
          value={registerData.apellido_paterno}
          onChange={handleRegisterChange}
          error={errors.apellido_paterno}
          placeholder="Pérez"
          autoComplete="family-name"
          required
        />
        <Input
          label="Apellido materno"
          name="apellido_materno"
          value={registerData.apellido_materno}
          onChange={handleRegisterChange}
          placeholder="García"
          help="Opcional"
        />
      </div>

      <Input
        label="Correo electrónico"
        type="email"
        name="correo_electronico"
        value={registerData.correo_electronico}
        onChange={handleRegisterChange}
        error={errors.correo_electronico}
        icon={<Mail size={16} />}
        placeholder="tu@email.com"
        autoComplete="email"
        required
      />

      <Input
        label="Número de teléfono"
        type="tel"
        name="numero_telefono"
        value={registerData.numero_telefono}
        onChange={handleRegisterChange}
        error={errors.numero_telefono}
        icon={<Phone size={16} />}
        placeholder="1234567890"
        inputMode="numeric"
        autoComplete="tel"
        required
      />

      <div className={styles.grid}>
        <Select
          label="Semestre actual"
          name="semestre"
          value={registerData.semestre}
          onChange={handleRegisterChange}
          options={SEMESTRES}
          placeholder="Selecciona..."
          error={errors.semestre}
          required
        />
        <Select
          label="Carrera"
          name="carrera"
          value={registerData.carreraEsOtra ? 'Otra' : registerData.carrera}
          onChange={handleCarreraChange}
          options={CARRERAS}
          placeholder="Selecciona..."
          error={registerData.carreraEsOtra ? undefined : errors.carrera}
          required
        />
      </div>

      {registerData.carreraEsOtra && (
        <Input
          label="¿Cuál es tu carrera?"
          // `id` explícito: este campo comparte `name` con el <Select> de arriba
          // (los dos escriben en `carrera`) y las primitivas derivan el id del
          // name. Sin esto habría dos elementos con id="carrera" y el <label>
          // "¿Cuál es tu carrera?" enfocaría el desplegable, no este campo.
          id="carrera_otra"
          name="carrera"
          value={registerData.carrera}
          onChange={handleRegisterChange}
          error={errors.carrera}
          placeholder="Escribe el nombre completo de tu carrera"
          required
        />
      )}
    </div>
  );

  const renderPasoCuenta = () => (
    <div className={styles.form}>
      <PasswordField
        label="Contraseña"
        name="contrasena"
        value={registerData.contrasena}
        onChange={handleRegisterChange}
        error={errors.contrasena}
        placeholder="Mínimo 8 caracteres"
        showStrength
        required
      />

      <PasswordField
        label="Confirmar contraseña"
        name="confirmar_contrasena"
        value={registerData.confirmar_contrasena}
        onChange={handleRegisterChange}
        error={errors.confirmar_contrasena}
        placeholder="Repite la contraseña"
        required
      />

      {/* Estas secciones solo existen si la afiliación correspondiente está
          marcada: nada de campos deshabilitados ni ocultos con CSS. */}
      {registerData.es_club_programacion && (
        <section className={styles.seccion}>
          <h3 className={styles.seccionTitulo}>
            <Trophy size={16} aria-hidden="true" /> Perfiles en plataformas
          </h3>
          <p className={styles.seccionTexto}>
            Con ellos calculamos tu progreso en la tabla de posiciones. Basta con
            uno para empezar y puedes añadir los demás más adelante desde tu
            perfil.
          </p>

          {errors.plataformas && <Aviso icono={<X size={16} />}>{errors.plataformas}</Aviso>}

          {PLATAFORMAS.map(({ campo, etiqueta, placeholder }) => (
            <Input
              key={campo}
              label={etiqueta}
              name={campo}
              value={registerData[campo]}
              onChange={handleRegisterChange}
              placeholder={placeholder}
              autoComplete="off"
            />
          ))}
        </section>
      )}

      {registerData.es_computer_society && (
        <section className={styles.seccion}>
          <h3 className={styles.seccionTitulo}>
            <BadgeCheck size={16} aria-hidden="true" /> Capítulo Computer Society
          </h3>
          <Input
            label="Número IEEE"
            name="numero_ieee"
            value={registerData.numero_ieee}
            onChange={handleRegisterChange}
            error={errors.numero_ieee}
            icon={<Shield size={16} />}
            placeholder="Ej. 12345678"
            inputMode="numeric"
            help="Lo encuentras en tu credencial IEEE o en ieee.org › My Account › Membership."
            required
          />
        </section>
      )}
    </div>
  );

  const renderRegisterForm = () => (
    <motion.form
      key="register"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onSubmit={handleRegister}
      noValidate
    >
      {renderStepper()}

      {errors.general && (
        <div className="mb-4">
          <Aviso icono={<X size={16} />}>{errors.general}</Aviso>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={paso}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18 }}
        >
          {paso === 1 && renderPasoAfiliacion()}
          {paso === 2 && renderPasoDatos()}
          {paso === 3 && renderPasoCuenta()}
        </motion.div>
      </AnimatePresence>

      <div className={styles.navRow}>
        {paso > 1 ? (
          <Button type="button" variant="ghost" onClick={retrocederPaso}>
            <ArrowLeft size={16} /> Atrás
          </Button>
        ) : (
          <span />
        )}

        {/* Las `key` distintas son imprescindibles, no decorativas: sin ellas
            React reconcilia los dos botones como el MISMO nodo del DOM y se
            limita a cambiar `type` de "button" a "submit". Como el navegador
            decide la acción por defecto del clic DESPUÉS de ejecutar los
            manejadores, al avanzar al último paso el nodo ya era un submit y el
            formulario se enviaba solo, mostrando los errores del paso 3 nada
            más abrirlo. Con `key` React monta un botón nuevo y eso no ocurre. */}
        {paso < PASOS.length ? (
          <Button key="continuar" type="button" size="lg" onClick={avanzarPaso}>
            Continuar <ArrowRight size={16} />
          </Button>
        ) : (
          <Button key="crear-cuenta" type="submit" size="lg" loading={isLoading}>
            Crear cuenta
          </Button>
        )}
      </div>
    </motion.form>
  );

  const renderAuthView = () => (
    <div className="w-full">
      {/* Control segmentado: son dos botones de alternancia, no pestañas ARIA
          (unas pestañas exigirían un tabpanel con id, que aquí no existe). */}
      <div className={styles.tabs} role="group" aria-label="Acceso">
        <button
          type="button"
          aria-pressed={isLogin}
          className={`${styles.tab} ${isLogin ? styles.tabActive : ''}`}
          onClick={() => cambiarPestana(true)}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          aria-pressed={!isLogin}
          className={`${styles.tab} ${!isLogin ? styles.tabActive : ''}`}
          onClick={() => cambiarPestana(false)}
        >
          Registrarte
        </button>
      </div>

      <div className={styles.header}>
        <h2 className={styles.title}>{isLogin ? 'Bienvenido' : 'Crear cuenta'}</h2>
        <p className={styles.subtitle}>
          {isLogin
            ? 'Inicia sesión para continuar'
            : 'Tres pasos y formas parte de la comunidad Crocoders'}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {isLogin ? (
          <motion.form
            key="login"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={styles.form}
            onSubmit={handleLogin}
            noValidate
          >
            {successMessage && (
              <Aviso tipo="exito" icono={<Check size={16} />}>
                {successMessage}
              </Aviso>
            )}

            {errors.general && <Aviso icono={<X size={16} />}>{errors.general}</Aviso>}

            <Input
              label="Correo electrónico"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={16} />}
              placeholder="tu@email.com"
              autoComplete="email"
              required
            />

            <PasswordField
              label="Contraseña"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            <div className={styles.linkRow}>
              <button type="button" onClick={() => goToView('recovery')} className={styles.linkButton}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <Button type="submit" size="lg" loading={isLoading} className="w-full">
              Iniciar sesión
            </Button>
          </motion.form>
        ) : (
          renderRegisterForm()
        )}
      </AnimatePresence>

      <div className={styles.toggleText}>
        {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
        <button onClick={() => cambiarPestana(!isLogin)} className={styles.toggleLink} type="button">
          {isLogin ? 'Regístrate' : 'Inicia sesión'}
        </button>
      </div>
    </div>
  );

  const renderRecoveryView = () => (
    <form className={styles.form} onSubmit={handleRecoveryRequest} noValidate>
      <button type="button" onClick={() => goToView('auth')} className={styles.backButton}>
        <ArrowLeft size={16} /> Volver
      </button>

      <div className={styles.header}>
        <h2 className={`${styles.title} ${styles.stepTitle}`}>Recuperar contraseña</h2>
        <p className={styles.subtitle}>
          Escribe tu correo y te enviaremos un código de 6 dígitos.
        </p>
      </div>

      {errors.general && <Aviso icono={<X size={16} />}>{errors.general}</Aviso>}

      <Input
        label="Correo registrado"
        type="email"
        name="recoveryEmail"
        value={recoveryEmail}
        onChange={(e) => {
          setRecoveryEmail(e.target.value);
          if (errors.recoveryEmail) setErrors({});
        }}
        error={errors.recoveryEmail}
        icon={<Mail size={16} />}
        placeholder="tu@email.com"
        autoComplete="email"
        required
      />

      <Button type="submit" size="lg" loading={isLoading} className="w-full">
        Enviar código
      </Button>
    </form>
  );

  const renderVerifyCodeView = () => (
    <form className={styles.form} onSubmit={handleVerifyCode} noValidate>
      <button type="button" onClick={() => goToView('recovery')} className={styles.backButton}>
        <ArrowLeft size={16} /> Cambiar de correo
      </button>

      <div className={styles.header}>
        <h2 className={`${styles.title} ${styles.stepTitle}`}>Verificar código</h2>
        <p className={styles.subtitle}>
          Si <strong>{recoveryEmail}</strong> corresponde a una cuenta, recibirás
          un código de 6 dígitos. Revisa también la carpeta de spam.
        </p>
      </div>

      {errors.general && <Aviso icono={<X size={16} />}>{errors.general}</Aviso>}

      <Input
        label="Código de verificación"
        name="verificationCode"
        value={verificationCode}
        onChange={(e) => {
          const valor = e.target.value.replace(/\D/g, '').slice(0, 6);
          setVerificationCode(valor);
          if (errors.verificationCode) setErrors({});
        }}
        error={errors.verificationCode}
        icon={<Shield size={16} />}
        className={styles.codeInput}
        inputMode="numeric"
        maxLength={6}
        placeholder="000000"
        autoComplete="one-time-code"
        required
      />

      <div className={styles.acciones}>
        <Button type="submit" size="lg" loading={isLoading} className="w-full">
          Verificar
        </Button>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => handleRecoveryRequest()}
          disabled={isLoading}
        >
          ¿No te llegó? Reenviar código
        </button>
      </div>
    </form>
  );

  const renderResetView = () => (
    <form className={styles.form} onSubmit={handlePasswordReset} noValidate>
      <button type="button" onClick={() => goToView('auth')} className={styles.backButton}>
        <ArrowLeft size={16} /> Volver
      </button>

      <div className={styles.header}>
        <h2 className={`${styles.title} ${styles.stepTitle}`}>Restablecer contraseña</h2>
      </div>

      {errors.general && <Aviso icono={<X size={16} />}>{errors.general}</Aviso>}

      {tokenVerified ? (
        <>
          <Aviso tipo="info" icono={<Info size={16} />}>
            Crea una contraseña con al menos 8 caracteres e incluye mayúsculas,
            números o símbolos.
          </Aviso>

          <PasswordField
            label="Nueva contraseña"
            name="newPassword"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (errors.newPassword) setErrors((prev) => ({ ...prev, newPassword: undefined }));
            }}
            error={errors.newPassword}
            placeholder="Nueva contraseña"
            showStrength
            required
          />

          <PasswordField
            label="Confirmar nueva contraseña"
            name="confirmNewPassword"
            value={confirmNewPassword}
            onChange={(e) => {
              setConfirmNewPassword(e.target.value);
              if (errors.confirmNewPassword)
                setErrors((prev) => ({ ...prev, confirmNewPassword: undefined }));
            }}
            error={errors.confirmNewPassword}
            placeholder="Repite la contraseña"
            required
          />

          <Button type="submit" size="lg" loading={isLoading} className="w-full">
            Restablecer contraseña
          </Button>
        </>
      ) : (
        // Sin token verificado no hay nada que restablecer: se devuelve al
        // usuario al paso del código en vez de dejar un spinner infinito.
        <div className={styles.acciones}>
          <Aviso icono={<X size={16} />}>
            Tu código ya no es válido. Vuelve a solicitarlo para continuar.
          </Aviso>
          <Button type="button" variant="secondary" onClick={() => goToView('recovery')}>
            Solicitar un código nuevo
          </Button>
        </div>
      )}
    </form>
  );

  return (
    <div className={styles.pageWrapper}>
      <motion.div
        ref={tarjetaRef}
        className={`${styles.authCard} ${!isLogin && view === 'auth' ? styles.wide : ''}`}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'auth'
              ? renderAuthView()
              : view === 'recovery'
                ? renderRecoveryView()
                : view === 'verify-code'
                  ? renderVerifyCodeView()
                  : renderResetView()}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/**
 * Esqueleto con la forma real de la tarjeta de acceso. Antes el fallback era la
 * palabra "Cargando…" centrada en una pantalla vacía: al montar el contenido,
 * la tarjeta aparecía de golpe y la página parecía saltar. Manteniendo el mismo
 * contenedor y el mismo ancho, la transición es continua.
 */
function AuthSkeleton() {
  return (
    <div className={styles.pageWrapper}>
      <div className={styles.authCard} aria-busy="true" aria-label="Cargando el acceso">
        <Skeleton className="mx-auto h-10 w-56 rounded-full" />
        <Skeleton className="mx-auto mt-8 h-8 w-44" />
        <Skeleton className="mx-auto mt-3 h-4 w-64" />
        <Skeleton className="mt-8 h-11 w-full" />
        <Skeleton className="mt-5 h-11 w-full" />
        <Skeleton className="mt-8 h-12 w-full" />
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <AuthContent />
    </Suspense>
  );
}
