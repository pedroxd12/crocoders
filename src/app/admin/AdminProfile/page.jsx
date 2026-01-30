'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FaUser, FaLock, FaEnvelope, FaCode, FaCalendarAlt, FaHistory, FaEdit, FaTimes, FaCheck, FaGraduationCap, FaBook, FaUniversity } from 'react-icons/fa';
import LoadingSpinner from '@/components/LoadingSpinner';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
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
    'Ingeniería en Mecatronica',
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

  // Carga inicial de datos
  useEffect(() => {
    if (!user || !initialLoad) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError('');
        
        const [profileResult, eventsResult] = await Promise.allSettled([
          fetchUserProfile(),
          fetchEvents()
        ]);

        if (profileResult.status === 'rejected' || eventsResult.status === 'rejected') {
          const error = profileResult.reason || eventsResult.reason;
          console.error('Error loading data:', error);
          setError('Error al cargar algunos datos. Intente recargar la página.');
        }
      } catch (error) {
        console.error('Unexpected error:', error);
        setError('Error inesperado al cargar datos.');
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    };

    loadData();
  }, [user, initialLoad, fetchUserProfile, fetchEvents]);

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

  const handleGoBack = () => {
    router.back();
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
      <div className="min-h-screen bg-gray-900 text-white">
        {/* Header adaptado al nuevo diseño */}
        <header className="bg-gray-800 p-4 shadow-xl border-b border-gray-700 sticky top-0 z-10">
          <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-green-600 text-transparent bg-clip-text">
              Mi Perfil
            </h1>
            <button 
              onClick={handleGoBack}
              className="flex items-center bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-all duration-300 shadow-md"
            >
              ← Regresar
            </button>
          </div>
        </header>

        <main className="container mx-auto p-4 md:p-6">
          {/* Mensajes de feedback */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm flex items-center justify-between animate-fade-in-down">
              <div className="flex items-center">
                <FaTimes className="mr-2" />
                {error}
              </div>
              <button 
                onClick={handleRetryLoadData}
                className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded transition"
              >
                Reintentar
              </button>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-green-500/20 border border-green-500 rounded-lg text-green-300 text-sm flex items-center animate-fade-in-down">
              <FaCheck className="mr-2" />
              {successMessage}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-6">
            {/* Sidebar */}
            <aside className="w-full md:w-64 bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700">
              <div className="flex flex-col items-center mb-6">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center mb-3 shadow-lg">
                  <FaUser className="text-4xl text-white" />
                </div>
                <h2 className="text-xl font-semibold text-center text-white">{user.name || user.nombre_completo}</h2>
                <p className="text-gray-400 text-sm mt-1">
                  <span className={`px-2 py-1 rounded-full text-xs ${user.role === 'administrador' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'}`}>
                    {user.role === 'administrador' ? 'Administrador' : 'Miembro'}
                  </span>
                </p>
                
                {(user.semestre || user.carrera) && (
                  <div className="mt-3 text-center">
                    {user.semestre && (
                      <p className="text-gray-300 text-sm flex items-center justify-center">
                        <FaGraduationCap className="mr-1" /> {user.semestre}° Semestre
                      </p>
                    )}
                    {user.carrera && (
                      <p className="text-gray-300 text-sm flex items-center justify-center mt-1">
                        <FaUniversity className="mr-1" /> {user.carrera}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <nav className="space-y-2">
                <button
                  onClick={() => setActiveTab('events')}
                  className={`w-full text-left px-4 py-2 rounded-lg flex items-center transition-all duration-300 ${activeTab === 'events' ? 'bg-gradient-to-r from-green-600 to-green-700 shadow-md text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                >
                  <FaCalendarAlt className="mr-3" /> Mis Eventos
                </button>
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`w-full text-left px-4 py-2 rounded-lg flex items-center transition-all duration-300 ${activeTab === 'profile' ? 'bg-gradient-to-r from-green-600 to-green-700 shadow-md text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                >
                  <FaUser className="mr-3" /> Mi Perfil
                </button>
                <button
                  onClick={() => setActiveTab('security')}
                  className={`w-full text-left px-4 py-2 rounded-lg flex items-center transition-all duration-300 ${activeTab === 'security' ? 'bg-gradient-to-r from-green-600 to-green-700 shadow-md text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                >
                  <FaLock className="mr-3" /> Seguridad
                </button>
              </nav>
            </aside>

            {/* Contenido principal */}
            <div className="flex-1 bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
              {activeTab === 'events' && (
                <div>
                  <h2 className="text-2xl font-bold mb-6 text-green-400 flex items-center">
                    <FaCalendarAlt className="mr-2" /> Mis Participaciones
                  </h2>
                  
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  ) : events.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-gray-700">
                      <table className="w-full text-left">
                        <thead className="bg-gray-700">
                          <tr>
                            <th className="p-3 font-medium">Evento</th>
                            <th className="p-3 font-medium">Fecha</th>
                            <th className="p-3 font-medium">Participación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.map((event) => (
                            <tr 
                              key={`event-${event.id_evento}`}
                              className="border-b border-gray-700 hover:bg-gray-700/50 transition-colors duration-200"
                            >
                              <td className="p-3 font-medium">{event.nombre}</td>
                              <td className="p-3">
                                {new Date(event.fecha).toLocaleDateString('es-MX', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </td>
                              <td className="p-3">
                                {event.participacion ? (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-900/50 text-green-300 border border-green-600">
                                    Participó
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-900/50 text-red-300 border border-red-600">
                                    No participó
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      No hay registros de participación en eventos aún.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'profile' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-green-400 flex items-center">
                      <FaUser className="mr-2" /> Mi Perfil
                    </h2>
                    {!editMode && (
                      <button
                        onClick={() => setEditMode(true)}
                        className="flex items-center bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-4 py-2 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-md"
                      >
                        <FaEdit className="mr-2" /> Editar Perfil
                      </button>
                    )}
                  </div>

                  {editMode ? (
                    <form onSubmit={handleProfileUpdate} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="block text-gray-300 mb-2">Nombre Completo *</label>
                          <input
                            type="text"
                            className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                            value={formData.nombre_completo}
                            onChange={(e) => setFormData({...formData, nombre_completo: e.target.value})}
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-gray-300 mb-2">Teléfono</label>
                          <input
                            type="tel"
                            className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                            value={formData.numero_telefono}
                            onChange={(e) => setFormData({...formData, numero_telefono: e.target.value})}
                            pattern="[0-9]{10}"
                            title="Número de 10 dígitos"
                          />
                        </div>

                        <div>
                          <label className="block text-gray-300 mb-2">Semestre</label>
                          <select
                            className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                            value={formData.semestre}
                            onChange={(e) => setFormData({...formData, semestre: e.target.value})}
                          >
                            <option value="">Seleccionar semestre</option>
                            {Array.from({length: 14}, (_, i) => i + 1).map((sem) => (
                              <option key={sem} value={sem}>{sem}° Semestre</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-gray-300 mb-2">Carrera</label>
                          <select
                            className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                            value={formData.carrera}
                            onChange={(e) => setFormData({...formData, carrera: e.target.value})}
                          >
                            <option value="">Seleccionar carrera</option>
                            {carreras.map((carrera) => (
                              <option key={carrera} value={carrera}>{carrera}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-gray-300 mb-2">Codeforces</label>
                          <div className="relative">
                            <input
                              type="text"
                              className="w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                              value={formData.usuario_codeforces}
                              onChange={(e) => setFormData({...formData, usuario_codeforces: e.target.value})}
                              placeholder="Usuario"
                            />
                            <FaCode className="absolute left-3 top-3.5 text-gray-400" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-gray-300 mb-2">VJudge</label>
                          <div className="relative">
                            <input
                              type="text"
                              className="w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                              value={formData.usuario_vjudge}
                              onChange={(e) => setFormData({...formData, usuario_vjudge: e.target.value})}
                              placeholder="Usuario"
                            />
                            <FaCode className="absolute left-3 top-3.5 text-gray-400" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-gray-300 mb-2">OmegaUp</label>
                          <div className="relative">
                            <input
                              type="text"
                              className="w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                              value={formData.usuario_omegaup}
                              onChange={(e) => setFormData({...formData, usuario_omegaup: e.target.value})}
                              placeholder="Usuario"
                            />
                            <FaCode className="absolute left-3 top-3.5 text-gray-400" />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end space-x-3 pt-4">
                        <button
                          type="button"
                          onClick={() => setEditMode(false)}
                          className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-all duration-300 shadow-md"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-md"
                        >
                          Guardar Cambios
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-gray-700/30 p-5 rounded-xl border border-gray-700 shadow-inner">
                        <h3 className="text-lg font-semibold mb-4 text-green-400 flex items-center pb-2 border-b border-gray-700">
                          <FaUser className="mr-2" /> Información Personal
                        </h3>
                        <div className="space-y-4 mt-4">
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Nombre Completo</p>
                            <p className="text-white font-medium">{user.name || user.nombre_completo}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Correo Electrónico</p>
                            <p className="text-white font-medium">{user.email}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Teléfono</p>
                            <p className="text-white font-medium">{user.numero_telefono || 'No especificado'}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Semestre</p>
                            <p className="text-white font-medium flex items-center">
                              {user.semestre ? (
                                <>
                                  <span className="inline-block w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-xs mr-2">
                                    {user.semestre}
                                  </span>
                                  {user.semestre}° Semestre
                                </>
                              ) : 'No especificado'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Carrera</p>
                            <p className="text-white font-medium flex items-center">
                              {user.carrera ? (
                                <>
                                  <FaBook className="text-green-400 mr-2" />
                                  {user.carrera}
                                </>
                              ) : 'No especificada'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-700/30 p-5 rounded-xl border border-gray-700 shadow-inner">
                        <h3 className="text-lg font-semibold mb-4 text-green-400 flex items-center pb-2 border-b border-gray-700">
                          <FaCode className="mr-2" /> Perfiles en Plataformas
                        </h3>
                        <div className="space-y-4 mt-4">
                          <div>
                            <p className="text-gray-400 text-sm mb-1">Codeforces</p>
                            <p className={`font-medium ${user.usuario_codeforces ? 'text-white' : 'text-gray-500'}`}>
                              {user.usuario_codeforces || 'No registrado'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm mb-1">VJudge</p>
                            <p className={`font-medium ${user.usuario_vjudge ? 'text-white' : 'text-gray-500'}`}>
                              {user.usuario_vjudge || 'No registrado'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm mb-1">OmegaUp</p>
                            <p className={`font-medium ${user.usuario_omegaup ? 'text-white' : 'text-gray-500'}`}>
                              {user.usuario_omegaup || 'No registrado'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'security' && (
                <div>
                  <h2 className="text-2xl font-bold mb-6 text-green-400 flex items-center">
                    <FaLock className="mr-2" /> Seguridad
                  </h2>
                  
                  <form onSubmit={handlePasswordChange} className="max-w-lg space-y-4">
                    <div>
                      <label className="block text-gray-300 mb-2">Contraseña Actual *</label>
                      <div className="relative">
                        <input
                          type="password"
                          className="w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                          value={passwordData.currentPassword}
                          onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                          required
                          placeholder="Ingresa tu contraseña actual"
                        />
                        <FaLock className="absolute left-3 top-3.5 text-gray-400" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-gray-300 mb-2">Nueva Contraseña *</label>
                      <div className="relative">
                        <input
                          type="password"
                          className="w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                          required
                          minLength="8"
                          placeholder="Mínimo 8 caracteres"
                        />
                        <FaLock className="absolute left-3 top-3.5 text-gray-400" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">La contraseña debe tener al menos 8 caracteres</p>
                    </div>

                    <div>
                      <label className="block text-gray-300 mb-2">Confirmar Nueva Contraseña *</label>
                      <div className="relative">
                        <input
                          type="password"
                          className="w-full p-3 pl-10 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none transition"
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                          required
                          minLength="8"
                          placeholder="Confirma tu nueva contraseña"
                        />
                        <FaLock className="absolute left-3 top-3.5 text-gray-400" />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 rounded-lg transition-all duration-300 transform hover:scale-105 mt-4 shadow-md"
                    >
                      Cambiar Contraseña
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}