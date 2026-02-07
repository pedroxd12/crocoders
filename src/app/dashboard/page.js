'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FaUser, FaLock, FaEnvelope, FaCode, FaCalendarAlt, FaHistory, FaEdit, FaSignOutAlt, FaTimes, FaCheck, FaGraduationCap, FaBook, FaUserShield, FaClipboardCheck } from 'react-icons/fa';
import LoadingSpinner from '@/components/LoadingSpinner';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user, logout, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('events');
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    nombre_completo: '',
    numero_telefono: '',
    semestre: '',
    carrera: '',
    usuario_codeforces: '',
    usuario_vjudge: '',
    usuario_omegaup: ''
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [events, setEvents] = useState([]);
  const [staffEvents, setStaffEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [initialLoad, setInitialLoad] = useState(true);
  const router = useRouter();

  // Lista de carreras disponibles
  const carreras = [
    'Ingeniería en Sistemas Computacionales',
    'Ingeniería en Electronica',
    'Ingeniería Industrial',
    'Ingeniería Quimica',
    'Ingeniería en Logistica',
    'Ingeniería en Mecatronica'
  ];

  // Función para cargar datos del usuario
  const fetchUserProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/user/profile', { 
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        updateUser(data.user);
        setFormData({
          nombre_completo: data.user.nombre_completo,
          numero_telefono: data.user.numero_telefono || '',
          semestre: data.user.semestre || '',
          carrera: data.user.carrera || '',
          usuario_codeforces: data.user.usuario_codeforces || '',
          usuario_vjudge: data.user.usuario_vjudge || '',
          usuario_omegaup: data.user.usuario_omegaup || ''
        });
      }
      return data;
    } catch (error) {
      console.error('Error fetching profile:', error);
      setError('Error al cargar el perfil. Intente recargar la página.');
      return { success: false, error: error.message };
    }
  }, [updateUser]);

  // Función para cargar eventos
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/user/events', { 
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      setEvents(data);
      return { success: true };
    } catch (error) {
      console.error('Error fetching events:', error);
      setError('Error al cargar eventos. Intente recargar la página.');
      return { success: false, error: error.message };
    }
  }, []);

  // Función para cargar eventos donde soy staff
  const fetchStaffEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/staff/eventos', { 
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!res.ok) {
        // Si retorna 401 o 403, simplemente no tiene eventos de staff
        if (res.status === 401 || res.status === 403) {
          setStaffEvents([]);
          return { success: true };
        }
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      setStaffEvents(data || []);
      return { success: true };
    } catch (error) {
      console.error('Error fetching staff events:', error);
      setStaffEvents([]);
      return { success: false, error: error.message };
    }
  }, []);

  // Carga inicial de datos
  useEffect(() => {
    if (!user || !initialLoad) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError('');
        
        const [profileResult, eventsResult, staffEventsResult] = await Promise.allSettled([
          fetchUserProfile(),
          fetchEvents(),
          fetchStaffEvents()
        ]);

        if (profileResult.status === 'rejected' || eventsResult.status === 'rejected') {
          const error = profileResult.reason || eventsResult.reason;
          console.error('Error loading data:', error);
          setError('Error al cargar algunos datos. Intente recargar la página.');
        }
        // Staff events son opcionales, no mostrar error si fallan
      } catch (error) {
        console.error('Unexpected error:', error);
        setError('Error inesperado al cargar datos.');
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    };

    loadData();
  }, [user, initialLoad, fetchUserProfile, fetchEvents, fetchStaffEvents]);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
        credentials: 'include'
      });

      const responseData = await res.json();
      
      if (res.ok) {
        setSuccessMessage(responseData.message || 'Perfil actualizado correctamente');
        setEditMode(false);
        updateUser({
          name: formData.nombre_completo,
          nombre_completo: formData.nombre_completo,
          numero_telefono: formData.numero_telefono,
          semestre: formData.semestre,
          carrera: formData.carrera,
          usuario_codeforces: formData.usuario_codeforces,
          usuario_vjudge: formData.usuario_vjudge,
          usuario_omegaup: formData.usuario_omegaup
        });
      } else {
        setError(responseData.error || 'Error al actualizar el perfil');
      }
    } catch (error) {
      setError('Error de conexión con el servidor');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        }),
        credentials: 'include'
      });

      const responseData = await res.json();
      
      if (res.ok) {
        setSuccessMessage(responseData.message || 'Contraseña actualizada correctamente');
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        setError(responseData.error || 'Error al cambiar la contraseña');
      }
    } catch (error) {
      setError('Error de conexión con el servidor');
    }
  };
 
  const handleLogout = async () => {
    try {
      await logout();
      router.push('/iniciar');
    } catch (error) {
      console.error('Logout error:', error);
      setError('Error al cerrar sesión');
    }
  };

  const handleRetryLoadData = () => {
    setInitialLoad(true);
    setError('');
  };

  if (loading && initialLoad) {
    return <LoadingSpinner fullPage />;
  }

  if (!user) {
    return null; // ProtectedRoute manejará la redirección
  }

  return (
    <ProtectedRoute> 
      <div className="min-h-screen relative overflow-hidden bg-[#1a1a1a] text-gray-100">
        {/* Background Pattern */}
        <div className="dot-pattern fixed inset-0 z-0 pointer-events-none" />

        <main className="relative z-10 container mx-auto px-4 pt-28 pb-12 max-w-7xl">
           
           <div className="flex flex-col md:flex-row justify-between items-end mb-10 pb-6 border-b border-white/10">
              <div>
                 <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-600 mb-2">
                    Mi Escritorio
                 </h1>
                 <p className="text-gray-400 text-lg">Bienvenido de nuevo, <span className="text-white font-medium">{user.name || user.nombre_completo}</span></p>
              </div>
              
              <div className="hidden md:block text-right">
                  <p className="text-sm text-gray-500 font-medium tracking-wide uppercase">{new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
           </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-300 text-sm flex items-center justify-between backdrop-blur-sm">
              <div className="flex items-center">
                <FaTimes className="mr-2" />
                {error}
              </div>
              <button 
                onClick={handleRetryLoadData}
                className="text-xs bg-red-600/80 hover:bg-red-600 px-3 py-1.5 rounded transition"
              >
                Reintentar
              </button>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/50 rounded-xl text-green-300 text-sm flex items-center backdrop-blur-sm">
              <FaCheck className="mr-2" />
              {successMessage}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar / Profile Card */}
            <aside className="lg:col-span-4 xl:col-span-3 space-y-6">
               <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-xl flex flex-col items-center">
                    <div className="relative mb-6 group">
                        <div className="w-32 h-32 rounded-full p-1 bg-gradient-to-tr from-green-400 to-emerald-600 shadow-xl">
                             <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center text-4xl font-bold text-gray-300">
                                {user.name ? user.name[0].toUpperCase() : <FaUser />}
                             </div>
                        </div>
                        <div className="absolute bottom-1 right-2 w-5 h-5 bg-green-500 border-4 border-gray-900 rounded-full"></div>
                    </div>
                    
                    <h2 className="text-xl font-bold text-white text-center">{user.name || user.nombre_completo}</h2>
                    <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                        {user.role === 'administrador' ? 'Administrador' : 'Miembro Oficial'}
                    </span>
                    
                    <div className="w-full mt-6 space-y-3 pt-6 border-t border-white/10">
                         {user.semestre && (
                            <div className="flex items-center justify-between text-sm text-gray-400">
                                <span className="flex items-center gap-2"><FaGraduationCap /> Semestre</span>
                                <span className="text-white font-medium">{user.semestre}°</span>
                            </div>
                         )}
                         {user.numero_telefono && (
                            <div className="flex items-center justify-between text-sm text-gray-400">
                                <span className="flex items-center gap-2"><FaUser /> Teléfono</span>
                                <span className="text-white font-medium">{user.numero_telefono}</span>
                            </div>
                         )}
                    </div>
               </div>

               <nav className="bg-gray-900/60 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl space-y-2">
                  <button
                    onClick={() => setActiveTab('events')}
                    className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center transition-all duration-200 ${
                        activeTab === 'events' 
                        ? 'bg-gradient-to-r from-green-600 to-emerald-700 text-white shadow-lg' 
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <FaHistory className="mr-3 text-lg" /> 
                    <span className="font-medium">Mis Eventos</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('profile')}
                    className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center transition-all duration-200 ${
                        activeTab === 'profile' 
                        ? 'bg-gradient-to-r from-green-600 to-emerald-700 text-white shadow-lg' 
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <FaUser className="mr-3 text-lg" />
                     <span className="font-medium">Editar Perfil</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('security')}
                    className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center transition-all duration-200 ${
                        activeTab === 'security' 
                        ? 'bg-gradient-to-r from-green-600 to-emerald-700 text-white shadow-lg' 
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <FaLock className="mr-3 text-lg" />
                     <span className="font-medium">Seguridad</span>
                  </button>
                  
                  {staffEvents.length > 0 && (
                    <button
                      onClick={() => setActiveTab('staff')}
                      className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center transition-all duration-200 ${
                          activeTab === 'staff' 
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg' 
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <FaUserShield className="mr-3 text-lg" />
                      <span className="font-medium">Mis Eventos Staff</span>
                      <span className="ml-auto bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {staffEvents.length}
                      </span>
                    </button>
                  )}
                  
                  <div className="pt-4 mt-2 border-t border-white/10">
                      <button 
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-3.5 rounded-xl flex items-center text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200"
                      >
                        <FaSignOutAlt className="mr-3 text-lg" /> 
                        <span className="font-medium">Cerrar Sesión</span>
                      </button>
                  </div>
               </nav>
            </aside>

            {/* Main Content */}
            <div className="lg:col-span-8 xl:col-span-9">
              <div className="bg-gray-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-6 md:p-8 min-h-[500px]">
                {activeTab === 'events' && (
                <div className="space-y-6">
                  <div className="flex items-center space-x-4 mb-6">
                     <div className="p-3.5 rounded-xl bg-green-500/20 text-green-400">
                        <FaCalendarAlt size={24} />
                     </div>
                     <h2 className="text-2xl font-bold text-white">Historial de Participación</h2>
                  </div>
                  
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <LoadingSpinner />
                    </div>
                  ) : events.length > 0 ? (
                    <div className="grid gap-4">
                        {events.map((event) => (
                           <div key={`event-${event.id_evento}`} className="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl p-5 transition-all duration-300 flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white group-hover:text-green-400 transition-colors">{event.nombre}</h3>
                                    <p className="text-sm text-gray-400 flex items-center mt-2">
                                        <FaCalendarAlt className="mr-2 text-xs" />
                                        {new Date(event.fecha).toLocaleDateString('es-MX', { dateStyle: 'long' })}
                                    </p>
                                </div>
                                <div>
                                    {event.participacion ? (
                                        <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.3)]">
                                            <FaCheck className="mr-1.5" size={10} /> PARTICIPÓ
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold bg-gray-700/50 text-gray-400 border border-gray-600">
                                            NO PARTICIPÓ
                                        </span>
                                    )}
                                </div>
                           </div>
                        ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
                      <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mb-6">
                         <FaHistory size={32} />
                      </div>
                      <h3 className="text-lg font-medium text-gray-400">Sin historial de eventos</h3>
                      <p className="text-sm mt-2 max-w-xs mx-auto">Aún no has participado en ningún evento. ¡Inscríbete en los próximos eventos!</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center space-x-4">
                        <div className="p-3.5 rounded-xl bg-blue-500/20 text-blue-400">
                             <FaUser size={24} />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Información Personal</h2>
                    </div>
                    {!editMode && (
                      <button
                        onClick={() => setEditMode(true)}
                        className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition shadow-lg shadow-blue-900/40 font-medium"
                      >
                        <FaEdit className="mr-2" /> Editar
                      </button>
                    )}
                  </div>

                  {editMode ? (
                    <form onSubmit={handleProfileUpdate} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-2">
                          <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Nombre Completo</label>
                          <input
                            type="text"
                            className="w-full p-4 rounded-xl bg-black/40 text-white border border-gray-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                            value={formData.nombre_completo}
                            onChange={(e) => setFormData({...formData, nombre_completo: e.target.value})}
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Teléfono</label>
                          <input
                            type="text"
                            className="w-full p-4 rounded-xl bg-black/40 text-white border border-gray-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                            value={formData.numero_telefono}
                            onChange={(e) => setFormData({...formData, numero_telefono: e.target.value})}
                          />
                        </div>

                        <div>
                          <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Carrera</label>
                          <select
                            className="w-full p-4 rounded-xl bg-black/40 text-white border border-gray-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition appearance-none"
                            value={formData.carrera}
                            onChange={(e) => setFormData({...formData, carrera: e.target.value})}
                          >
                            <option value="">Seleccione una carrera</option>
                            {carreras.map((carrera) => (
                              <option key={carrera} value={carrera} className="bg-gray-800">{carrera}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Semestre</label>
                          <select
                            className="w-full p-4 rounded-xl bg-black/40 text-white border border-gray-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition appearance-none"
                            value={formData.semestre}
                            onChange={(e) => setFormData({...formData, semestre: e.target.value})}
                          >
                            <option value="">Seleccione un semestre</option>
                            {Array.from({length: 14}, (_, i) => i + 1).map((sem) => (
                              <option key={sem} value={sem} className="bg-gray-800">{sem}° Semestre</option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-2 mt-4">
                             <h3 className="text-gray-300 font-bold mb-6 flex items-center border-b border-gray-700 pb-2"><FaCode className="mr-2 text-green-400"/> Cuentas de Plataformas</h3>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-gray-500 text-xs mb-2 uppercase tracking-wider font-bold">Codeforces</label>
                                    <input
                                        type="text"
                                        placeholder="Username"
                                        className="w-full p-3 rounded-lg bg-black/40 text-white border border-gray-700 focus:border-green-500 transition text-sm"
                                        value={formData.usuario_codeforces}
                                        onChange={(e) => setFormData({...formData, usuario_codeforces: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-500 text-xs mb-2 uppercase tracking-wider font-bold">OmegaUp</label>
                                    <input
                                        type="text"
                                        placeholder="Username"
                                        className="w-full p-3 rounded-lg bg-black/40 text-white border border-gray-700 focus:border-green-500 transition text-sm"
                                        value={formData.usuario_omegaup}
                                        onChange={(e) => setFormData({...formData, usuario_omegaup: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-500 text-xs mb-2 uppercase tracking-wider font-bold">VJudge</label>
                                    <input
                                        type="text"
                                        placeholder="Username"
                                        className="w-full p-3 rounded-lg bg-black/40 text-white border border-gray-700 focus:border-green-500 transition text-sm"
                                        value={formData.usuario_vjudge}
                                        onChange={(e) => setFormData({...formData, usuario_vjudge: e.target.value})}
                                    />
                                </div>
                             </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-4 pt-6 mt-4 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => setEditMode(false)}
                          className="px-6 py-3 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition font-medium"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-8 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/30 transition transform hover:scale-105 font-bold"
                        >
                          Guardar Cambios
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="bg-black/20 rounded-2xl p-6 md:p-8 border border-white/5 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
                            <div>
                                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-2 font-bold">Nombre Completo</label>
                                <p className="text-xl font-medium text-white">{user.name || user.nombre_completo}</p>
                            </div>
                            <div>
                                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-2 font-bold">Correo Electrónico</label>
                                <p className="text-xl font-medium text-white">{user.email}</p>
                            </div>
                            <div>
                                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-2 font-bold">Semestre</label>
                                <p className="text-xl font-medium text-white">{user.semestre ? `${user.semestre}° Semestre` : 'No registrado'}</p>
                            </div>
                             <div>
                                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-2 font-bold">Teléfono</label>
                                <p className="text-xl font-medium text-white">{user.numero_telefono || 'No registrado'}</p>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-gray-500 text-xs uppercase tracking-wider mb-2 font-bold">Carrera</label>
                                <p className="text-xl font-medium text-white">{user.carrera || 'No registrada'}</p>
                            </div>
                        </div>

                        <div className="pt-8 border-t border-white/10">
                            <h3 className="text-gray-400 font-bold mb-6 flex items-center text-sm uppercase tracking-wider"><FaCode className="mr-2"/> Identificadores de Plataforma</h3>
                            <div className="flex flex-wrap gap-4">
                                {user.usuario_codeforces && (
                                    <span className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 flex items-center hover:bg-gray-700 transition">
                                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 mr-2.5 shadow-[0_0_8px_rgba(234,179,8,0.5)]"></span> 
                                        Codeforces: <span className="text-white ml-2 font-mono font-medium">{user.usuario_codeforces}</span>
                                    </span>
                                )}
                                {user.usuario_omegaup && (
                                    <span className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 flex items-center hover:bg-gray-700 transition">
                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-2.5 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span> 
                                        OmegaUp: <span className="text-white ml-2 font-mono font-medium">{user.usuario_omegaup}</span>
                                    </span>
                                )}
                                {user.usuario_vjudge && (
                                    <span className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 flex items-center hover:bg-gray-700 transition">
                                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 mr-2.5 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></span> 
                                        VJudge: <span className="text-white ml-2 font-mono font-medium">{user.usuario_vjudge}</span>
                                    </span>
                                )}
                                {!user.usuario_codeforces && !user.usuario_omegaup && !user.usuario_vjudge && (
                                    <p className="text-gray-500 italic text-sm py-2">No has registrado tus usuarios de plataformas.</p>
                                )}
                            </div>
                        </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'security' && (
                <div className="space-y-6">
                   <div className="flex items-center space-x-4 mb-6">
                     <div className="p-3.5 rounded-xl bg-red-500/20 text-red-400">
                        <FaLock size={24} />
                     </div>
                     <h2 className="text-2xl font-bold text-white">Seguridad de la Cuenta</h2>
                   </div>

                  <form onSubmit={handlePasswordChange} className="space-y-6 max-w-lg mx-auto md:mx-0">
                    <div>
                      <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Contraseña Actual</label>
                      <input
                        type="password"
                        className="w-full p-4 rounded-xl bg-black/40 text-white border border-gray-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Nueva Contraseña</label>
                      <input
                        type="password"
                        className="w-full p-4 rounded-xl bg-black/40 text-white border border-gray-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                        required
                        minLength="8"
                        placeholder="Mínimo 8 caracteres"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Confirmar Nueva Contraseña</label>
                      <input
                        type="password"
                        className="w-full p-4 rounded-xl bg-black/40 text-white border border-gray-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                        required
                        minLength="8"
                      />
                    </div>
                    <div className="pt-6">
                      <button
                        type="submit"
                        className="w-full md:w-auto px-10 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-900/40 transition transform hover:scale-105"
                      >
                        Actualizar Contraseña
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'staff' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3.5 rounded-xl bg-blue-500/20 text-blue-400">
                        <FaUserShield size={24} />
                      </div>
                      <h2 className="text-2xl font-bold text-white">Mis Eventos Como Staff</h2>
                    </div>
                    <button
                      onClick={() => router.push('/staff')}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition transform hover:scale-105"
                    >
                      <FaClipboardCheck className="inline mr-2" />
                      Panel Completo
                    </button>
                  </div>

                  <p className="text-gray-400 mb-6">
                    Eventos donde estás asignado como staff. Haz clic en "Panel Completo" para acceder a las funciones de registro de asistencia.
                  </p>

                  {staffEvents.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="inline-block p-6 rounded-full bg-gray-800/50 mb-4">
                        <FaUserShield size={48} className="text-gray-600" />
                      </div>
                      <p className="text-gray-400 text-lg">No estás asignado como staff en ningún evento actualmente.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {staffEvents.map(event => (
                        <div 
                          key={event.id_evento}
                          className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-700 hover:border-blue-500 transition-all duration-300 shadow-lg hover:shadow-blue-900/30"
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-xl font-bold text-white mb-2">{event.titulo}</h3>
                              <p className="text-gray-400 text-sm mb-3">{event.descripcion}</p>
                            </div>
                            <span className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${
                              event.estado === 'abierto' 
                                ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                : 'bg-gray-500/20 text-gray-400 border border-gray-500/50'
                            }`}>
                              {event.estado}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="flex items-center text-gray-300">
                              <FaCalendarAlt className="mr-2 text-blue-400" />
                              <span className="text-sm">
                                {new Date(event.fecha_inicio).toLocaleDateString('es-MX', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                            <div className="flex items-center text-gray-300">
                              <FaBook className="mr-2 text-purple-400" />
                              <span className="text-sm">{event.tipo_evento}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                            <div className="text-sm text-gray-400">
                              <span className="font-semibold text-blue-400">{event.total_inscritos || 0}</span> inscritos
                              {event.cupos_disponibles && (
                                <span className="ml-2">de <span className="font-semibold">{event.cupos_disponibles}</span> cupos</span>
                              )}
                            </div>
                            <button
                              onClick={() => router.push(`/staff/eventos/${event.id_evento}`)}
                              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
                            >
                              Ver Detalles
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
            {/* End Main Content Col */}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
