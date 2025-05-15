// src/app/iniciar/page.js
'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FaUser, FaLock, FaEnvelope, FaPhone, FaCheck, FaTimes, FaShieldAlt, FaGlobeAmericas, FaInfoCircle, FaArrowLeft, FaEye, FaEyeSlash } from 'react-icons/fa';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-toastify';

function AuthContent() {
  // Estados para login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Estados para registro
  const [registerData, setRegisterData] = useState({
    nombre_completo: '',
    correo_electronico: '',
    contrasena: '',
    confirmar_contrasena: '',
    numero_telefono: '',
    usuario_codeforces: '',
    usuario_vjudge: '',
    usuario_omegaup: '',
    semestre: '',
    carrera: ''
  });
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [passwordsMatch, setPasswordsMatch] = useState(true);

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

  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, login, register } = useAuth();

  // Carreras disponibles
  const carreras = [
    'Ingeniería en Sistemas Computacionales',
    'Ingeniería en Electronica',
    'Ingeniería Industrial',
    'Ingeniería Quimica',
    'Ingeniería en Logistica',
    'Ingeniería en Mecatronica',
  ];

  // Manejador de registro post-login
  const handlePostLoginRegistration = useCallback(async (eventId) => {
    try {
      if (!user?.id) {
        throw new Error('Usuario no autenticado correctamente');
      }
  
      const response = await fetch('/api/eventos/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventoId: eventId,
          userId: user.id,
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
  }, [user, searchParams, router]);

  useEffect(() => {
    const recoveryParam = searchParams.get('recovery');
    const registerEvent = searchParams.get('registerEvent');
    
    if (recoveryParam) {
      setView('recovery');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (registerEvent && user && !loading) {
      handlePostLoginRegistration(registerEvent);
    }
  }, [searchParams, user, loading, handlePostLoginRegistration]);

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
      nombre_completo, 
      correo_electronico, 
      contrasena, 
      confirmar_contrasena,
      numero_telefono,
      semestre,
      carrera,
      // NUEVO: Campos de plataformas
      usuario_codeforces,
      usuario_vjudge,
      usuario_omegaup
    } = registerData;

    if (!nombre_completo) newErrors.nombre_completo = 'Nombre completo es requerido';
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
    // MODIFICADO: Hacer teléfono requerido
    if (!numero_telefono) {
        newErrors.numero_telefono = 'Número de teléfono es requerido';
    } else if (!validatePhone(numero_telefono)) {
      newErrors.numero_telefono = 'Teléfono no válido (10-15 dígitos)';
    }
    if (!semestre) newErrors.semestre = 'Semestre es requerido';
    if (!carrera) newErrors.carrera = 'Carrera es requerida';

    // NUEVO: Validaciones para campos de plataformas
    if (!usuario_codeforces) newErrors.usuario_codeforces = 'Usuario de Codeforces es requerido';
    if (!usuario_vjudge) newErrors.usuario_vjudge = 'Usuario de VJudge es requerido';
    if (!usuario_omegaup) newErrors.usuario_omegaup = 'Usuario de OmegaUp es requerido';


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
      nombre_completo: '',
      correo_electronico: '',
      contrasena: '',
      confirmar_contrasena: '',
      numero_telefono: '',
      usuario_codeforces: '',
      usuario_vjudge: '',
      usuario_omegaup: '',
      semestre: '',
      carrera: ''
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
      
      if (!result.success) {
        throw new Error(result.error || 'Contraseña incorrecta o usuario no encontrado');
      }

      toast.success('¡Inicio de sesión exitoso! Redirigiendo...');

      const registerEvent = searchParams.get('registerEvent');
      if (registerEvent) {
        await handlePostLoginRegistration(registerEvent);
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

      toast.success('¡Registro exitoso! Se ha enviado un correo de confirmación a tu dirección de email.');
      resetForm();
      
      const registerEvent = searchParams.get('registerEvent');
      if (registerEvent) {
        await handlePostLoginRegistration(registerEvent);
      } else {
        window.location.href = result.redirectTo || '/dashboard';
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
        await handlePostLoginRegistration(registerEvent);
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
    const { name, value } = e.target;
    setRegisterData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
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
    <>
      <div className="flex justify-center mb-6">
        <div className="flex space-x-1 bg-gray-700 p-1 rounded-full">
          <button 
            className={`px-6 py-2 rounded-full transition-all ${isLogin ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg' : 'text-gray-300 hover:text-white'}`}
            onClick={() => { setIsLogin(true); setErrors({}); }}
          >
            Iniciar sesión
          </button>
          <button 
            className={`px-6 py-2 rounded-full transition-all ${!isLogin ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg' : 'text-gray-300 hover:text-white'}`}
            onClick={() => { setIsLogin(false); setErrors({}); }}
          >
            Registrarte
          </button>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-center mb-6 text-green-400">
        {isLogin ? 'Inicia sesión en tu cuenta' : 'Crea una nueva cuenta'}
      </h2>

      {errors.general && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm flex items-center animate-fade-in">
          <FaTimes className="mr-2 flex-shrink-0" />
          {errors.general}
        </div>
      )}

      {isLogin ? (
        <form className="space-y-4" onSubmit={handleLogin}>
          <div className="group">
            <label className="block text-gray-300 mb-2 flex items-center">
              <FaEnvelope className="mr-2" /> Email
            </label>
            <div className="relative">
              <input 
                type="email" 
                className={`w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border ${errors.general ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
              />
              <FaEnvelope className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
            </div>
          </div>

          <div className="group">
            <label className="block text-gray-300 mb-2 flex items-center">
              <FaLock className="mr-2" /> Contraseña
            </label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                className={`w-full p-3 pl-10 pr-10 rounded-lg bg-gray-700 text-white border ${errors.general ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
              <FaLock className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
              <button 
                type="button"
                className="absolute right-3 top-3.5 text-gray-400 hover:text-green-400 transition"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button 
              type="button"
              onClick={() => setView('recovery')}
              className="text-sm text-green-400 hover:text-green-300 transition hover:underline flex items-center"
            >
              <FaLock className="mr-1" /> ¿Olvidaste tu contraseña?
            </button>
          </div>

          <button 
            className={`w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-green-500/30 flex items-center justify-center ${isLoading ? 'opacity-75 cursor-not-allowed' : 'hover:brightness-110 hover:scale-[1.01]'}`}
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Procesando...
              </div>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={handleRegister}>
          <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-3 text-sm text-blue-300 flex items-start">
            <FaInfoCircle className="mr-2 mt-0.5 flex-shrink-0" />
            <span>Por favor completa todos los campos para registrarte en nuestra plataforma.</span>
          </div>

          <div className="group">
            <label className="block text-gray-300 mb-2 flex items-center">
              <FaUser className="mr-2" /> Nombre completo
            </label>
            <div className="relative">
              <input 
                type="text" 
                name="nombre_completo"
                className={`w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border ${errors.nombre_completo ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={registerData.nombre_completo} 
                onChange={handleRegisterChange}
                required 
              />
              <FaUser className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
            </div>
            {errors.nombre_completo && (
              <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.nombre_completo}</p>
            )}
          </div>

          <div className="group">
            <label className="block text-gray-300 mb-2 flex items-center">
              <FaEnvelope className="mr-2" /> Email
            </label>
            <div className="relative">
              <input 
                type="email" 
                name="correo_electronico"
                className={`w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border ${errors.correo_electronico ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={registerData.correo_electronico} 
                onChange={handleRegisterChange}
                required 
              />
              <FaEnvelope className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
            </div>
            {errors.correo_electronico && (
              <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.correo_electronico}</p>
            )}
          </div>

          <div className="group">
            <label className="block text-gray-300 mb-2 flex items-center">
              <FaLock className="mr-2" /> Contraseña
            </label>
            <div className="relative">
              <input 
                type={showRegisterPassword ? "text" : "password"} 
                name="contrasena"
                className={`w-full p-3 pl-10 pr-10 rounded-lg bg-gray-700 text-white border ${errors.contrasena ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={registerData.contrasena} 
                onChange={handleRegisterChange}
                required 
                minLength={8}
              />
              <FaLock className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
              <button 
                type="button"
                className="absolute right-3 top-3.5 text-gray-400 hover:text-green-400 transition"
                onClick={() => setShowRegisterPassword(!showRegisterPassword)}
              >
                {showRegisterPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            <div className="mt-2">
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${getPasswordStrengthColor(passwordStrength)} transition-all duration-300`} 
                  style={{ width: `${(passwordStrength / 4) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Seguridad:</span>
                <span className={`${passwordStrength >= 3 ? 'text-green-400' : passwordStrength >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {getPasswordStrengthText(passwordStrength)}
                </span>
              </div>
            </div>
            {errors.contrasena && (
              <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.contrasena}</p>
            )}
          </div>

          <div className="group">
            <label className="block text-gray-300 mb-2 flex items-center">
              <FaLock className="mr-2" /> Confirmar contraseña
            </label>
            <div className="relative">
              <input 
                type={showRegisterConfirmPassword ? "text" : "password"} 
                name="confirmar_contrasena"
                className={`w-full p-3 pl-10 pr-10 rounded-lg bg-gray-700 text-white border ${errors.confirmar_contrasena ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={registerData.confirmar_contrasena} 
                onChange={handleRegisterChange}
                required 
                minLength={8}
              />
              <FaLock className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
              <button 
                type="button"
                className="absolute right-3 top-3.5 text-gray-400 hover:text-green-400 transition"
                onClick={() => setShowRegisterConfirmPassword(!showRegisterConfirmPassword)}
              >
                {showRegisterConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {!passwordsMatch && (
              <p className="mt-1 text-sm text-red-400 animate-fade-in">Las contraseñas no coinciden</p>
            )}
            {errors.confirmar_contrasena && (
              <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.confirmar_contrasena}</p>
            )}
          </div>

          {/* MODIFICADO: Teléfono ahora es requerido */}
          <div className="group">
            <label className="block text-gray-300 mb-2 flex items-center">
              <FaPhone className="mr-2" /> Número de teléfono
            </label>
            <div className="relative">
              <input 
                type="tel" 
                name="numero_telefono"
                className={`w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border ${errors.numero_telefono ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={registerData.numero_telefono} 
                onChange={handleRegisterChange}
                pattern="[0-9]{10,15}"
                title="Número de teléfono (10-15 dígitos)"
                required // NUEVO: Agregado
              />
              <FaPhone className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
            </div>
            {errors.numero_telefono && (
              <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.numero_telefono}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="group">
              <label className="block text-gray-300 mb-2">Semestre</label>
              <select
                name="semestre"
                className={`w-full p-3 rounded-lg bg-gray-700 text-white border ${errors.semestre ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={registerData.semestre}
                onChange={handleRegisterChange}
                required
              >
                <option value="">Selecciona...</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(sem => (
                  <option key={sem} value={sem}>{sem}</option>
                ))}
              </select>
              {errors.semestre && (
                <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.semestre}</p>
              )}
            </div>

            <div className="group">
              <label className="block text-gray-300 mb-2">Carrera</label>
              <select
                name="carrera"
                className={`w-full p-3 rounded-lg bg-gray-700 text-white border ${errors.carrera ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={registerData.carrera}
                onChange={handleRegisterChange}
                required
              >
                <option value="">Selecciona...</option>
                {carreras.map(carrera => (
                  <option key={carrera} value={carrera}>{carrera}</option>
                ))}
              </select>
              {errors.carrera && (
                <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.carrera}</p>
              )}
            </div>
          </div>
          
          {/* MODIFICADO: Campos de plataformas ahora son requeridos */}
          <div className="space-y-4">
            <h3 className="text-gray-300 text-sm font-medium">Perfiles en plataformas de programación</h3>
            <p className="text-xs text-gray-400 -mt-3">
              Estos datos nos ayudarán a hacer seguimiento de tu progreso.
              Favor de crear una cuenta en estas plataformas de programación. <span className="text-red-400">* Requerido</span>
            </p>
            
            <div className="group">
              <label className="block text-gray-300 mb-2">Codeforces <span className="text-red-400">*</span></label>
              <input 
                type="text" 
                name="usuario_codeforces"
                className={`w-full p-3 rounded-lg bg-gray-700 text-white border ${errors.usuario_codeforces ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={registerData.usuario_codeforces} 
                onChange={handleRegisterChange}
                placeholder="Usuario de Codeforces"
                required // NUEVO: Agregado
              />
              {errors.usuario_codeforces && (
                <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.usuario_codeforces}</p>
              )}
            </div>

            <div className="group">
              <label className="block text-gray-300 mb-2">VJudge <span className="text-red-400">*</span></label>
              <input 
                type="text" 
                name="usuario_vjudge"
                className={`w-full p-3 rounded-lg bg-gray-700 text-white border ${errors.usuario_vjudge ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={registerData.usuario_vjudge} 
                onChange={handleRegisterChange}
                placeholder="Usuario de VJudge"
                required // NUEVO: Agregado
              />
              {errors.usuario_vjudge && (
                <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.usuario_vjudge}</p>
              )}
            </div>

            <div className="group">
              <label className="block text-gray-300 mb-2">OmegaUp <span className="text-red-400">*</span></label>
              <input 
                type="text" 
                name="usuario_omegaup"
                className={`w-full p-3 rounded-lg bg-gray-700 text-white border ${errors.usuario_omegaup ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={registerData.usuario_omegaup} 
                onChange={handleRegisterChange}
                placeholder="Usuario de OmegaUp"
                required // NUEVO: Agregado
              />
              {errors.usuario_omegaup && (
                <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.usuario_omegaup}</p>
              )}
            </div>
          </div>

          <button 
            className={`w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-green-500/30 flex items-center justify-center ${isLoading ? 'opacity-75 cursor-not-allowed' : 'hover:brightness-110 hover:scale-[1.01]'}`}
            type="submit"
            disabled={isLoading || !passwordsMatch}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Procesando...
              </div>
            ) : (
              'Registrarse'
            )}
          </button>
        </form>
      )}

      <div className="mt-6 text-center text-gray-400">
        {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}{' '}
        <button 
          onClick={() => {
            setIsLogin(!isLogin);
            setErrors({});
          }}
          className="text-green-400 hover:text-green-300 transition hover:underline font-medium"
        >
          {isLogin ? 'Regístrate' : 'Inicia sesión'}
        </button>
      </div>
    </>
  );

  const renderRecoveryView = () => (
    <div className="space-y-4">
      <button 
        onClick={() => setView('auth')} 
        className="flex items-center text-gray-400 hover:text-white transition"
      >
        <FaArrowLeft className="mr-2" /> Volver al inicio
      </button>

      <h2 className="text-2xl font-bold text-center mb-6 text-green-400">
        Recuperar contraseña
      </h2>

      {errors.general && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm flex items-center animate-fade-in">
          <FaTimes className="mr-2" />
          {errors.general}
        </div>
      )}

      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-3 text-sm text-blue-300 flex items-start mb-4">
        <FaInfoCircle className="mr-2 mt-0.5 flex-shrink-0" />
        <span>Ingresa tu dirección de correo electrónico registrada. Te enviaremos un código de verificación para restablecer tu contraseña.</span>
      </div>

      <div className="group">
        <label className="block text-gray-300 mb-2 flex items-center">
          <FaEnvelope className="mr-2" /> Email registrado
        </label>
        <div className="relative">
          <input 
            type="email" 
            className={`w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border ${errors.recoveryEmail ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
            value={recoveryEmail} 
            onChange={(e) => setRecoveryEmail(e.target.value)} 
            required 
          />
          <FaEnvelope className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
        </div>
        {errors.recoveryEmail && (
          <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.recoveryEmail}</p>
        )}
      </div>

      <button 
        className={`w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-green-500/30 flex items-center justify-center ${isLoading ? 'opacity-75 cursor-not-allowed' : 'hover:brightness-110 hover:scale-[1.01]'}`}
        onClick={handleRecoveryRequest}
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            Procesando...
          </div>
        ) : (
          'Enviar código de verificación'
        )}
      </button>
    </div>
  );

  const renderVerifyCodeView = () => (
    <div className="space-y-4">
      <button 
        onClick={() => setView('recovery')} 
        className="flex items-center text-gray-400 hover:text-white transition"
      >
        <FaArrowLeft className="mr-2" /> Volver
      </button>

      <h2 className="text-2xl font-bold text-center mb-6 text-green-400">
        Verificar código
      </h2>

      {errors.general && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm flex items-center animate-fade-in">
          <FaTimes className="mr-2" />
          {errors.general}
        </div>
      )}

      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-3 text-sm text-blue-300 flex items-start mb-4">
        <FaInfoCircle className="mr-2 mt-0.5 flex-shrink-0" />
        <span>Hemos enviado un código de 6 dígitos a tu correo electrónico. Por favor ingrésalo a continuación para verificar tu identidad.</span>
      </div>

      <div className="group">
        <label className="block text-gray-300 mb-2 flex items-center">
          <FaShieldAlt className="mr-2" /> Código de verificación
        </label>
        <div className="relative">
          <input 
            type="text" 
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            className={`w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border ${errors.verificationCode ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
            value={verificationCode} 
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 6);
              setVerificationCode(value);
              if (errors.verificationCode) {
                setErrors(prev => ({ ...prev, verificationCode: '' }));
              }
            }}
            required 
          />
          <FaShieldAlt className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
        </div>
        {errors.verificationCode && (
          <p className="mt-1 text-sm text-red-400 animate-fade-in">{errors.verificationCode}</p>
        )}
      </div>

      <button 
        className={`w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-green-500/30 flex items-center justify-center ${isLoading ? 'opacity-75 cursor-not-allowed' : 'hover:brightness-110 hover:scale-[1.01]'}`}
        onClick={handleVerifyCode}
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            Verificando...
          </div>
        ) : (
          'Verificar código'
        )}
      </button>
    </div>
  );

  const renderResetView = () => (
    <div className="space-y-4">
      <button 
        onClick={() => setView('auth')} 
        className="flex items-center text-gray-400 hover:text-white transition"
      >
        <FaArrowLeft className="mr-2" /> Volver al inicio
      </button>

      <h2 className="text-2xl font-bold text-center mb-6 text-green-400">
        Restablecer contraseña
      </h2>

      {errors.general && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm flex items-center animate-fade-in">
          <FaTimes className="mr-2" />
          {errors.general}
        </div>
      )}

      {!tokenVerified && isLoading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
        </div>
      ) : tokenVerified ? (
        <>
          <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-3 text-sm text-blue-300 flex items-start mb-4">
            <FaInfoCircle className="mr-2 mt-0.5 flex-shrink-0" />
            <span>Crea una nueva contraseña segura para tu cuenta.</span>
          </div>

          <div className="group">
            <label className="block text-gray-300 mb-2 flex items-center">
              <FaLock className="mr-2" /> Nueva contraseña
            </label>
            <div className="relative">
              <input 
                type={showNewPassword ? "text" : "password"} 
                className={`w-full p-3 pl-10 pr-10 rounded-lg bg-gray-700 text-white border ${errors.newPassword ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                required 
              />
              <FaLock className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
              <button 
                type="button"
                className="absolute right-3 top-3.5 text-gray-400 hover:text-green-400 transition"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            <div className="mt-2">
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${getPasswordStrengthColor(checkPasswordStrength(newPassword))} transition-all duration-300`} 
                  style={{ width: `${(checkPasswordStrength(newPassword) / 4) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Seguridad:</span>
                <span className={`${checkPasswordStrength(newPassword) >= 3 ? 'text-green-400' : checkPasswordStrength(newPassword) >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {getPasswordStrengthText(checkPasswordStrength(newPassword))}
                </span>
              </div>
            </div>
          </div>

          <div className="group">
            <label className="block text-gray-300 mb-2 flex items-center">
              <FaLock className="mr-2" /> Confirmar nueva contraseña
            </label>
            <div className="relative">
              <input 
                type={showConfirmNewPassword ? "text" : "password"} 
                className={`w-full p-3 pl-10 pr-10 rounded-lg bg-gray-700 text-white border ${errors.confirmNewPassword ? 'border-red-500' : 'border-gray-600 focus:border-green-500'} focus:outline-none transition group-hover:shadow-lg group-hover:shadow-green-500/10`}
                value={confirmNewPassword} 
                onChange={(e) => setConfirmNewPassword(e.target.value)} 
                required 
              />
              <FaLock className="absolute left-3 top-3.5 text-gray-400 transition group-hover:text-green-400" />
              <button 
                type="button"
                className="absolute right-3 top-3.5 text-gray-400 hover:text-green-400 transition"
                onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
              >
                {showConfirmNewPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <button 
            className={`w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-green-500/30 flex items-center justify-center ${isLoading ? 'opacity-75 cursor-not-allowed' : 'hover:brightness-110 hover:scale-[1.01]'}`}
            onClick={handlePasswordReset}
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Procesando...
              </div>
            ) : (
              'Restablecer contraseña'
            )}
          </button>
        </>
      ) : (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Verificando tu código de recuperación...</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white flex items-center justify-center p-4">
      <div className="flex flex-col md:flex-row items-center justify-center w-full max-w-6xl gap-8">
        {/* Panel de imagen (solo en desktop) */}
        <div className="hidden md:flex flex-col items-center justify-center w-1/2">
          <div className="relative w-full max-w-md aspect-square">
            <Image 
              src="/img/logo.png" 
              alt="Cocodrilo programador" 
              fill
              className="rounded-lg object-contain animate-float"
              priority
            />
          </div>
          <h1 className="mt-6 text-4xl font-bold text-center text-green-400">
            {view === 'auth' 
              ? (isLogin ? 'Bienvenido de vuelta' : 'Únete a nuestra comunidad')
              : (view === 'recovery' || view === 'verify-code' 
                ? 'Recupera tu cuenta' 
                : 'Restablece tu contraseña')}
          </h1>
          <p className="mt-4 text-gray-300 text-center text-lg max-w-md">
            {view === 'auth' 
              ? (isLogin 
                ? 'Continúa tu viaje de programación competitiva' 
                : 'Empieza tu viaje en la programación competitiva')
              : (view === 'recovery'
                ? 'Te ayudaremos a recuperar el acceso a tu cuenta'
                : view === 'verify-code'
                  ? 'Verifica tu identidad para continuar'
                  : 'Crea una nueva contraseña segura')}
          </p>
        </div>

        {/* Contenedor del formulario */}
        <div className="bg-gray-800/90 backdrop-blur-sm p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-700 transition-all duration-300 hover:shadow-green-500/20 hover:border-green-500/30">
          {view === 'auth' ? renderAuthView() : 
           view === 'recovery' ? renderRecoveryView() :
           view === 'verify-code' ? renderVerifyCodeView() : 
           renderResetView()}
        </div>
      </div>
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