'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, Lock, Mail, Phone, Check, X, Shield, Globe, Info, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './page.module.css';

function AuthContent() {
  // Estados para login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Estados para registro
  const [registerData, setRegisterData] = useState({
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
    es_computer_society: false,
    es_club_programacion: false,
    numero_ieee: ''
  });
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [passwordsMatch, setPasswordsMatch] = useState(true);
  const [showManualCarrera, setShowManualCarrera] = useState(false);

  // Estados para recuperación
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [tokenVerified, setTokenVerified] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [sessionToken, setSessionToken] = useState('');

  // Estados para vistas y mensajes
  const [view, setView] = useState('auth');
  const [errors, setErrors] = useState({});
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, login, register } = useAuth();

  // Carreras disponibles
  const carreras = [
    'Ingeniería en Sistemas Computacionales',
    'Ingeniería en Electrónica',
    'Ingeniería Industrial',
    'Ingeniería Química',
    'Ingeniería en Logística',
    'Ingeniería en Mecatrónica',
    'Otra'
  ];

  // Manejador de registro post-login (no se memoriza para no entrar en
  // el array de deps del useEffect; usamos un ref para garantizar que se
  // dispare una sola vez por sesión y evitar bucles).
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
          tipo: 'miembro'
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
      toast.error(`Error al registrar: ${error.message}`);
      router.push(searchParams.get('from') || '/eventos');
    }
  };

  const postLoginHandledRef = useRef(false);

  useEffect(() => {
    const recoveryParam = searchParams.get('recovery');
    const registerEvent = searchParams.get('registerEvent');

    if (recoveryParam) {
      setView('recovery');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (registerEvent && user && !loading && !postLoginHandledRef.current) {
      postLoginHandledRef.current = true;
      handlePostLoginRegistration(registerEvent, user);
    }
    // handlePostLoginRegistration y router son estables; el ref evita doble disparo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, loading]);

  useEffect(() => {
    if (registerData.contrasena && registerData.confirmar_contrasena) {
      setPasswordsMatch(registerData.contrasena === registerData.confirmar_contrasena);
    } else {
      setPasswordsMatch(true);
    }
  }, [registerData.contrasena, registerData.confirmar_contrasena]);

  // Validaciones
  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  };

  const validatePhone = (phone) => /^[0-9]{10,15}$/.test(phone);

  const checkPasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    return strength;
  };

  const validateForm = () => {
    const newErrors = {};
    const { 
      nombre,
      apellido_paterno,
      correo_electronico, 
      contrasena, 
      confirmar_contrasena,
      numero_telefono,
      semestre,
      carrera,
      usuario_codeforces,
      usuario_vjudge,
      usuario_omegaup,
      es_computer_society,
      numero_ieee,
      es_club_programacion
    } = registerData;

    if (!nombre) newErrors.nombre = 'Nombre es requerido';
    if (!apellido_paterno) newErrors.apellido_paterno = 'Apellido paterno es requerido';
    if (!correo_electronico) {
      newErrors.correo_electronico = 'Email es requerido';
    } else if (!validateEmail(correo_electronico)) {
      newErrors.correo_electronico = 'Email no válido';
    }
    if (!contrasena) {
      newErrors.contrasena = 'Contraseña es requerida';
    }
    if (!confirmar_contrasena) {
      newErrors.confirmar_contrasena = 'Confirma tu contraseña';
    } else if (contrasena !== confirmar_contrasena) {
      newErrors.confirmar_contrasena = 'Las contraseñas no coinciden';
    }
    if (!numero_telefono) {
        newErrors.numero_telefono = 'Número de teléfono es requerido';
    } else if (!validatePhone(numero_telefono)) {
      newErrors.numero_telefono = 'Teléfono no válido (10-15 dígitos)';
    }
    if (!semestre) newErrors.semestre = 'Semestre es requerido';
    if (!carrera) newErrors.carrera = 'Carrera es requerida';

    if (!usuario_codeforces) newErrors.usuario_codeforces = 'Usuario de Codeforces es requerido';
    if (!usuario_vjudge) newErrors.usuario_vjudge = 'Usuario de VJudge es requerido';
    if (!usuario_omegaup) newErrors.usuario_omegaup = 'Usuario de OmegaUp es requerido';

    if (es_computer_society) {
      if (!numero_ieee) {
        newErrors.numero_ieee = 'Número IEEE es requerido para miembros de Computer Society';
      } else if (!/^\d+$/.test(numero_ieee)) {
        newErrors.numero_ieee = 'El número IEEE debe contener solo números';
      }
    }

    if (!es_club_programacion && !es_computer_society) {
      newErrors.afiliacion = 'Debes seleccionar una opción: Club, Capítulo o ambos.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  useEffect(() => {
    if (registerData.contrasena) {
      setPasswordStrength(checkPasswordStrength(registerData.contrasena));
    } else {
      setPasswordStrength(0);
    }
  }, [registerData.contrasena]);

  const resetForm = () => {
    setRegisterData({
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
      es_computer_society: false,
      es_club_programacion: false,
      numero_ieee: ''
    });
    setErrors({});
    setPasswordStrength(0);
    setPasswordsMatch(true);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);
    
    try {
      if (!email || !password) {
        throw new Error('Todos los campos son obligatorios');
      }

      if (!validateEmail(email)) {
        throw new Error('Por favor ingresa un email válido');
      }

      const result = await login(email, password);
      
      setSuccessMessage(''); // Limpiar mensaje de éxito previo
      
      if (!result.success) {
        throw new Error(result.error || 'Contraseña incorrecta o usuario no encontrado');
      }

      toast.success('¡Inicio de sesión exitoso! Redirigiendo...');

      const registerEvent = searchParams.get('registerEvent');
      if (registerEvent) {
        await handlePostLoginRegistration(registerEvent, result.user);
      } else {
        const redirectPath = result.redirectTo || 
                         (result.user?.role === 'administrador' ? '/admin' : '/dashboard');
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
    if (!validateForm()) return;
    
    setIsLoading(true);
    setErrors({});
    
    try {
      const result = await register(registerData);

      if (!result.success) {
        throw new Error(result.error || 'Error al registrarse');
      }

      toast.success(result.message || '¡Registro exitoso! Por favor inicia sesión.');
      resetForm();
      
      const registerEvent = searchParams.get('registerEvent');
      
      if (result.user) {
        // Auto-login exitoso
        if (registerEvent) {
          await handlePostLoginRegistration(registerEvent, result.user);
        } else {
          window.location.href = result.redirectTo || '/dashboard';
        }
      } else {
        // Registro exitoso pero requiere login manual
        setIsLogin(true); // Cambiar a vista de login
        setSuccessMessage('¡Cuenta creada exitosamente! Por favor inicia sesión.');
        
        if (registerEvent) {
          toast.info('Por favor inicia sesión para completar tu registro al evento');
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
    e.preventDefault();
    setErrors({});
    
    if (!recoveryEmail) {
      setErrors({ recoveryEmail: 'Email es requerido' });
      return;
    }

    if (!validateEmail(recoveryEmail)) {
      setErrors({ recoveryEmail: 'Email no válido' });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: recoveryEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al solicitar recuperación');
      }

      toast.success('Se ha enviado un correo con instrucciones para restablecer tu contraseña. Por favor revisa tu bandeja de entrada.');
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
    setErrors({});
    
    // Validar formato del código (6 dígitos)
    if (!verificationCode || !/^\d{6}$/.test(verificationCode)) {
      setErrors({ verificationCode: 'Por favor ingresa un código de 6 dígitos' });
      return;
    }
  
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: recoveryEmail,
          verificationCode 
        }),
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.error || 'El código de verificación es inválido o ha expirado');
      }
  
      if (!data.success) {
        throw new Error(data.error || 'Error al verificar el código');
      }
  
      setSessionToken(data.sessionToken);
      setTokenVerified(true);
      setView('reset');
      toast.success('Verificación exitosa. Ahora puedes establecer una nueva contraseña.');
    } catch (error) {
      toast.error(error.message || 'Error al verificar el código');
      setErrors({ 
        general: error.message,
        verificationCode: error.message.includes('código') ? error.message : undefined
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setErrors({});

    if (!newPassword || !confirmNewPassword) {
      setErrors({ general: 'Todos los campos son requeridos' });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrors({ general: 'Las contraseñas no coinciden' });
      return;
    }

    if (checkPasswordStrength(newPassword) < 3) {
      setErrors({ general: 'La contraseña debe ser al menos moderadamente segura' });
      return;
    }

    setIsLoading(true);
    try {
      const resetResponse = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ 
          newPassword,
          email: recoveryEmail 
        }),
      });

      const resetData = await resetResponse.json();

      if (!resetResponse.ok) {
        throw new Error(resetData.error || 'Error al restablecer contraseña');
      }

      const loginResponse = await login(recoveryEmail, newPassword);
      
      if (!loginResponse.success) {
        throw new Error(loginResponse.error || 'Contraseña actualizada pero falló el inicio de sesión automático');
      }

      toast.success('¡Contraseña actualizada correctamente! Iniciando sesión...');

      const registerEvent = searchParams.get('registerEvent');
      if (registerEvent) {
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

  const handleRegisterChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Validación inmediata para número IEEE (solo números)
    if (name === 'numero_ieee' && !/^\d*$/.test(value)) {
      return;
    }

    setRegisterData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errors[name] || errors.afiliacion) {
      setErrors(prev => {
         const newErrors = { ...prev };
         delete newErrors[name];
         delete newErrors.afiliacion;
         return newErrors;
      });
    }
  };

  const getPasswordStrengthColor = (strength) => {
    switch(strength) {
      case 0: return 'bg-gray-500';
      case 1: return 'bg-red-500';
      case 2: return 'bg-yellow-500';
      case 3: return 'bg-blue-500';
      case 4: return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getPasswordStrengthText = (strength) => {
    switch(strength) {
      case 0: return 'Muy débil';
      case 1: return 'Débil';
      case 2: return 'Moderada';
      case 3: return 'Fuerte';
      case 4: return 'Muy fuerte';
      default: return '';
    }
  };

  const renderAuthView = () => (
    <div className="w-full">
      <div className="flex justify-center mb-8">
        <div className="flex space-x-1 bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-sm">
          <button 
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${isLogin ? 'bg-green-500 text-black shadow-lg shadow-green-500/20' : 'text-gray-400 hover:text-white'}`}
            onClick={() => { setIsLogin(true); setErrors({}); }}
          >
            Iniciar sesión
          </button>
          <button 
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${!isLogin ? 'bg-green-500 text-black shadow-lg shadow-green-500/20' : 'text-gray-400 hover:text-white'}`}
            onClick={() => { setIsLogin(false); setErrors({}); }}
          >
            Registrarte
          </button>
        </div>
      </div>

      <div className="text-center mb-8">
        <h2 className={styles.title}>
            {isLogin ? 'Bienvenido' : 'Crear Cuenta'}
        </h2>
        <p className={styles.subtitle}>
          {isLogin ? 'Inicia sesión para continuar' : 'Únete a la comunidad de Crocoders'}
        </p>
      </div>

      {errors.general && (
        <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm flex items-center gap-3"
        >
          <X size={18} />
          {errors.general}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {isLogin ? (
          <motion.form 
            key="login"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={styles.form} 
            onSubmit={handleLogin}
          >
          {successMessage && (
             <motion.div 
               initial={{ opacity: 0, y: -10 }}
               animate={{ opacity: 1, y: 0 }}
               className="mb-6 p-4 bg-green-500/10 border border-green-500/50 rounded-xl text-green-400 text-sm flex items-center gap-3"
             >
               <Check size={18} />
               {successMessage}
             </motion.div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>
              <Mail size={16} /> Email
            </label>
            <div className={styles.inputWrapper}>
              <input 
                type="email" 
                className={`${styles.input} ${errors.general ? styles.inputError : ''}`}
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                placeholder="tu@email.com"
              />
              <Mail className={styles.inputIcon} size={18} />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              <Lock size={16} /> Contraseña
            </label>
            <div className={styles.inputWrapper}>
              <input 
                type={showPassword ? "text" : "password"} 
                className={`${styles.input} ${errors.general ? styles.inputError : ''}`}
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                placeholder="••••••••"
              />
              <Lock className={styles.inputIcon} size={18} />
              <button 
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button 
              type="button"
              onClick={() => setView('recovery')}
              className="text-sm text-green-500 hover:text-green-400 transition hover:underline flex items-center gap-1"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <button 
            className={styles.submitButton}
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? 'Procesando...' : 'Iniciar Sesión'}
          </button>
        </motion.form>
      ) : (
        <motion.form 
            key="register"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4" 
            onSubmit={handleRegister}
        >
          <div className={styles.formGroup}>
            <label className={styles.label}>Nombre</label>
            <div className={styles.inputWrapper}>
              <input 
                type="text" 
                name="nombre"
                className={`${styles.input} ${errors.nombre ? styles.inputError : ''}`}
                value={registerData.nombre} 
                onChange={handleRegisterChange}
                required 
                placeholder="Juan"
              />
              <User className={styles.inputIcon} size={18} />
            </div>
            {errors.nombre && (
              <p className={styles.errorText}>{errors.nombre}</p>
            )}
          </div>

          <div className={styles.grid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Apellido Paterno</label>
              <input 
                type="text" 
                name="apellido_paterno"
                className={`${styles.input} ${errors.apellido_paterno ? styles.inputError : ''}`}
                style={{ paddingLeft: '1rem' }}
                value={registerData.apellido_paterno} 
                onChange={handleRegisterChange}
                required 
                placeholder="Pérez"
              />
              {errors.apellido_paterno && (
                <p className={styles.errorText}>{errors.apellido_paterno}</p>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Apellido Materno</label>
              <input 
                type="text" 
                name="apellido_materno"
                className={styles.input}
                style={{ paddingLeft: '1rem' }}
                value={registerData.apellido_materno} 
                onChange={handleRegisterChange}
                placeholder="García"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              <Mail size={16} /> Email
            </label>
            <div className={styles.inputWrapper}>
              <input 
                type="email" 
                name="correo_electronico"
                className={`${styles.input} ${errors.correo_electronico ? styles.inputError : ''}`}
                value={registerData.correo_electronico} 
                onChange={handleRegisterChange}
                required 
                placeholder="tu@email.com"
              />
              <Mail className={styles.inputIcon} size={18} />
            </div>
            {errors.correo_electronico && (
              <p className={styles.errorText}>{errors.correo_electronico}</p>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              <Lock size={16} /> Contraseña
            </label>
            <div className={styles.inputWrapper}>
              <input 
                type={showRegisterPassword ? "text" : "password"} 
                name="contrasena"
                className={`${styles.input} ${errors.contrasena ? styles.inputError : ''}`}
                value={registerData.contrasena} 
                onChange={handleRegisterChange}
                required 
                minLength={8}
                placeholder="Mínimo 8 caracteres"
              />
              <Lock className={styles.inputIcon} size={18} />
              <button 
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowRegisterPassword(!showRegisterPassword)}
              >
                {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className={styles.strengthMeter}>
              <div 
                className={styles.strengthBar}
                style={{ 
                    width: `${(passwordStrength / 4) * 100}%`,
                    backgroundColor: ['#6b7280', '#ef4444', '#eab308', '#3b82f6', '#22c55e'][passwordStrength] || '#6b7280'
                }}
              ></div>
            </div>
            <div className={styles.strengthText}>
                <span>Seguridad:</span>
                <span style={{ color: ['#6b7280', '#ef4444', '#eab308', '#3b82f6', '#22c55e'][passwordStrength] }}>
                  {getPasswordStrengthText(passwordStrength)}
                </span>
            </div>
            {errors.contrasena && (
              <p className={styles.errorText}>{errors.contrasena}</p>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              <Lock size={16} /> Confirmar contraseña
            </label>
            <div className={styles.inputWrapper}>
              <input 
                type={showRegisterConfirmPassword ? "text" : "password"} 
                name="confirmar_contrasena"
                className={`${styles.input} ${errors.confirmar_contrasena ? styles.inputError : ''}`}
                value={registerData.confirmar_contrasena} 
                onChange={handleRegisterChange}
                required 
                minLength={8}
                placeholder="Repite la contraseña"
              />
              <Lock className={styles.inputIcon} size={18} />
              <button 
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowRegisterConfirmPassword(!showRegisterConfirmPassword)}
              >
                {showRegisterConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {!passwordsMatch && (
              <p className={styles.errorText}>Las contraseñas no coinciden</p>
            )}
            {errors.confirmar_contrasena && (
              <p className={styles.errorText}>{errors.confirmar_contrasena}</p>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              <Phone size={16} /> Número de teléfono
            </label>
            <div className={styles.inputWrapper}>
              <input 
                type="tel" 
                name="numero_telefono"
                className={`${styles.input} ${errors.numero_telefono ? styles.inputError : ''}`}
                value={registerData.numero_telefono} 
                onChange={handleRegisterChange}
                pattern="[0-9]{10,15}"
                title="Número de teléfono (10-15 dígitos)"
                required
                placeholder="1234567890"
              />
              <Phone className={styles.inputIcon} size={18} />
            </div>
            {errors.numero_telefono && (
              <p className={styles.errorText}>{errors.numero_telefono}</p>
            )}
          </div>

          <div className={styles.grid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Semestre</label>
              <select
                name="semestre"
                className={`${styles.input} ${errors.semestre ? styles.inputError : ''}`}
                style={{ paddingLeft: '1rem' }}
                value={registerData.semestre}
                onChange={handleRegisterChange}
                required
              >
                <option value="" style={{ color: 'black' }}>Selecciona...</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(sem => (
                  <option key={sem} value={sem} style={{ color: 'black' }}>{sem}</option>
                ))}
              </select>
              {errors.semestre && (
                <p className={styles.errorText}>{errors.semestre}</p>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Carrera</label>
              <select
                name="carrera"
                className={`${styles.input} ${errors.carrera ? styles.inputError : ''}`}
                style={{ paddingLeft: '1rem' }}
                value={showManualCarrera ? 'Otra' : registerData.carrera}
                onChange={(e) => {
                  if (e.target.value === 'Otra') {
                    setShowManualCarrera(true);
                    setRegisterData(prev => ({ ...prev, carrera: '' }));
                  } else {
                    setShowManualCarrera(false);
                    handleRegisterChange(e);
                  }
                }}
                required
              >
                <option value="" style={{ color: 'black' }}>Selecciona...</option>
                {carreras.map(c => (
                  <option key={c} value={c} style={{ color: 'black' }}>{c}</option>
                ))}
              </select>

              {showManualCarrera && (
                <input 
                  type="text" 
                  name="carrera"
                  className={`${styles.input} mt-2 ${errors.carrera ? styles.inputError : ''}`}
                  style={{ paddingLeft: '1rem' }}
                  value={registerData.carrera} 
                  onChange={handleRegisterChange}
                  placeholder="Escribe el nombre de tu carrera"
                  required 
                />
              )}

              {errors.carrera && (
                <p className={styles.errorText}>{errors.carrera}</p>
              )}
            </div>
          </div>
          
          {/* MODIFICADO: Campos de plataformas ahora son requeridos */}
          <div className="border-t border-white/10 pt-4 space-y-4">
            <h3 className="text-gray-300 text-sm font-medium">Perfiles en plataformas de programación</h3>
            <p className="text-xs text-gray-400">
              Crea una cuenta en estas plataformas si no tienes una. <span className="text-red-400">* Requerido</span>
            </p>
            
            <div className={styles.formGroup}>
              <label className={styles.label}>Codeforces <span className="text-red-400">*</span></label>
              <input 
                type="text" 
                name="usuario_codeforces"
                className={`${styles.input} ${errors.usuario_codeforces ? styles.inputError : ''}`}
                style={{ paddingLeft: '1rem' }}
                value={registerData.usuario_codeforces} 
                onChange={handleRegisterChange}
                placeholder="Usuario de Codeforces"
                required 
              />
              {errors.usuario_codeforces && (
                <p className={styles.errorText}>{errors.usuario_codeforces}</p>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>VJudge <span className="text-red-400">*</span></label>
              <input 
                type="text" 
                name="usuario_vjudge"
                className={`${styles.input} ${errors.usuario_vjudge ? styles.inputError : ''}`}
                style={{ paddingLeft: '1rem' }}
                value={registerData.usuario_vjudge} 
                onChange={handleRegisterChange}
                placeholder="Usuario de VJudge"
                required 
              />
              {errors.usuario_vjudge && (
                <p className={styles.errorText}>{errors.usuario_vjudge}</p>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>OmegaUp <span className="text-red-400">*</span></label>
              <input 
                type="text" 
                name="usuario_omegaup"
                className={`${styles.input} ${errors.usuario_omegaup ? styles.inputError : ''}`}
                style={{ paddingLeft: '1rem' }}
                value={registerData.usuario_omegaup} 
                onChange={handleRegisterChange}
                placeholder="Usuario de OmegaUp"
                required 
              />
              {errors.usuario_omegaup && (
                <p className={styles.errorText}>{errors.usuario_omegaup}</p>
              )}
            </div>
          </div>

          <div className="border-t border-white/10 pt-4 mt-4 space-y-4">
             <h3 className="text-gray-300 text-sm font-medium">Afiliación</h3>
             {errors.afiliacion && (
                <div className="p-2 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-xs">
                    {errors.afiliacion}
                </div>
             )}

             <label className={styles.checkboxGroup}>
                <input
                    type="checkbox"
                    id="es_club_programacion"
                    name="es_club_programacion"
                    checked={registerData.es_club_programacion}
                    onChange={handleRegisterChange}
                    className={styles.checkbox}
                />
                <span className="text-gray-300 text-sm select-none">
                    Soy miembro del Club de Programación
                </span>
             </label>

             <div className="flex flex-col space-y-3">
                <label className={styles.checkboxGroup}>
                    <input
                        type="checkbox"
                        id="es_computer_society"
                        name="es_computer_society"
                        checked={registerData.es_computer_society}
                        onChange={handleRegisterChange}
                        className={styles.checkbox}
                    />
                    <span className="text-gray-300 text-sm select-none">
                        Soy miembro de Computer Society
                    </span>
                </label>

                {registerData.es_computer_society && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="ml-6"
                    >
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Número IEEE <span className="text-red-400">*</span></label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                name="numero_ieee"
                                className={`${styles.input} ${errors.numero_ieee ? styles.inputError : ''}`}
                                style={{ paddingLeft: '1rem' }}
                                value={registerData.numero_ieee}
                                onChange={handleRegisterChange}
                                placeholder="Ej. 12345678"
                                required
                            />
                             {errors.numero_ieee && (
                                <p className={styles.errorText}>{errors.numero_ieee}</p>
                             )}
                        </div>
                    </motion.div>
                )}
             </div>
          </div>

          <button 
            className={styles.submitButton}
            type="submit"
            disabled={isLoading || !passwordsMatch}
            style={{ width: '100%' }}
          >
            {isLoading ? 'Procesando...' : 'Registrarse'}
          </button>
        </motion.form>
      )}
      </AnimatePresence>

      <div className={styles.toggleText}>
        {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
        <button 
          onClick={() => {
            setIsLogin(!isLogin);
            setErrors({});
          }}
          className={styles.toggleLink}
        >
          {isLogin ? 'Regístrate' : 'Inicia sesión'}
        </button>
      </div>
    </div>
  );

  const renderRecoveryView = () => (
    <div className={styles.form}>
      <button 
        onClick={() => setView('auth')} 
        className={styles.backButton}
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <div className={styles.header}>
        <h2 className={styles.title} style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          Recuperar Contraseña
        </h2>
        <p className={styles.subtitle}>
          Ingresa tu email para recibir un código.
        </p>
      </div>

      {errors.general && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <X size={16} />
          {errors.general}
        </div>
      )}

      <div className={styles.formGroup}>
        <label className={styles.label}>
          <Mail size={16} /> Email registrado
        </label>
        <div className={styles.inputWrapper}>
          <input 
            type="email" 
            className={`${styles.input} ${errors.recoveryEmail ? styles.inputError : ''}`}
            value={recoveryEmail} 
            onChange={(e) => setRecoveryEmail(e.target.value)} 
            required 
            placeholder="tu@email.com"
          />
          <Mail className={styles.inputIcon} size={18} />
        </div>
        {errors.recoveryEmail && (
          <p className={styles.errorText}>{errors.recoveryEmail}</p>
        )}
      </div>

      <button 
        className={styles.submitButton}
        onClick={handleRecoveryRequest}
        disabled={isLoading}
      >
        {isLoading ? 'Procesando...' : 'Enviar código'}
      </button>
    </div>
  );

  const renderVerifyCodeView = () => (
    <div className={styles.form}>
      <button 
        onClick={() => setView('recovery')} 
        className={styles.backButton}
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <div className={styles.header}>
        <h2 className={styles.title} style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Verificar Código</h2>
        <p className={styles.subtitle}>Ingresa el código enviado a tu correo.</p>
      </div>

      {errors.general && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <X size={16} />
          {errors.general}
        </div>
      )}

      <div className={styles.formGroup}>
        <label className={styles.label}>
          <Shield size={16} /> Código
        </label>
        <div className={styles.inputWrapper}>
          <input 
            type="text" 
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            className={`${styles.input} ${errors.verificationCode ? styles.inputError : ''}`}
            style={{ paddingLeft: '2.75rem', letterSpacing: '0.2rem', fontSize: '1.2rem' }}
            value={verificationCode} 
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 6);
              setVerificationCode(value);
              if (errors.verificationCode) {
                setErrors(prev => ({ ...prev, verificationCode: '' }));
              }
            }}
            required 
            placeholder="000000"
          />
          <Shield className={styles.inputIcon} size={18} />
        </div>
        {errors.verificationCode && (
          <p className={styles.errorText}>{errors.verificationCode}</p>
        )}
      </div>

      <button 
        className={styles.submitButton}
        onClick={handleVerifyCode}
        disabled={isLoading}
      >
        {isLoading ? 'Verificando...' : 'Verificar'}
      </button>
    </div>
  );

  const renderResetView = () => (
    <div className={styles.form}>
      <button 
        onClick={() => setView('auth')} 
        className={styles.backButton}
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <div className={styles.header}>
        <h2 className={styles.title} style={{ fontSize: '1.5rem' }}>Restablecer Contraseña</h2>
      </div>

      {errors.general && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <X size={16} />
          {errors.general}
        </div>
      )}

      {!tokenVerified && isLoading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
        </div>
      ) : tokenVerified ? (
        <>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-300 flex items-start mb-4 gap-2">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <span>Crea una nueva contraseña segura.</span>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              <Lock size={16} /> Nueva contraseña
            </label>
            <div className={styles.inputWrapper}>
              <input 
                type={showNewPassword ? "text" : "password"} 
                className={`${styles.input} ${errors.newPassword ? styles.inputError : ''}`}
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                required 
                placeholder="Nueva contraseña"
              />
              <Lock className={styles.inputIcon} size={18} />
              <button 
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
             <div className={styles.strengthMeter}>
                <div 
                  className={styles.strengthBar}
                  style={{ 
                    width: `${(checkPasswordStrength(newPassword) / 4) * 100}%`,
                    backgroundColor: ['#6b7280', '#ef4444', '#eab308', '#3b82f6', '#22c55e'][checkPasswordStrength(newPassword)] || '#6b7280'
                  }}
                ></div>
            </div>
            <div className={styles.strengthText}>
                <span>Seguridad:</span>
                <span style={{ color: ['#6b7280', '#ef4444', '#eab308', '#3b82f6', '#22c55e'][checkPasswordStrength(newPassword)] }}>
                  {getPasswordStrengthText(checkPasswordStrength(newPassword))}
                </span>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              <Lock size={16} /> Confirmar nueva contraseña
            </label>
            <div className={styles.inputWrapper}>
              <input 
                type={showConfirmNewPassword ? "text" : "password"} 
                className={`${styles.input} ${errors.confirmNewPassword ? styles.inputError : ''}`}
                value={confirmNewPassword} 
                onChange={(e) => setConfirmNewPassword(e.target.value)} 
                required 
                placeholder="Repite la contraseña"
              />
              <Lock className={styles.inputIcon} size={18} />
              <button 
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
              >
                {showConfirmNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button 
            className={styles.submitButton}
            onClick={handlePasswordReset}
            disabled={isLoading}
          >
            {isLoading ? 'Procesando...' : 'Restablecer'}
          </button>
        </>
      ) : (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Verificando tu código...</p>
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.pageWrapper}>
      <motion.div 
        className={`${styles.authCard} ${!isLogin && view === 'auth' ? styles.wide : ''}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <AnimatePresence mode="wait">
            <motion.div
                key={view}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
            >
                {view === 'auth' ? renderAuthView() : 
                view === 'recovery' ? renderRecoveryView() :
                view === 'verify-code' ? renderVerifyCodeView() : 
                renderResetView()}
            </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Cargando...</div>}>
      <AuthContent />
    </Suspense>
  );
}
