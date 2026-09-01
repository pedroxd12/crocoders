// context/authContext.js
'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { loginUser, logoutUser, getUserData, registerUser } from '@/lib/db-client';
import { APP_ROLES, isAdminRole, isMemberRole } from '@/lib/roles';

export const AuthContext = createContext();

// Re-exportado para compatibilidad histórica.
export const ROLES = APP_ROLES;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const normalizeUser = useCallback((userData) => {
    if (!userData) return null;
    
    // Construir nombre completo basado en los datos disponibles
    let nombreCompleto = userData.nombre_completo || userData.name || '';
    if (!nombreCompleto && userData.nombre) {
      nombreCompleto = `${userData.nombre} ${userData.apellido_paterno || ''} ${userData.apellido_materno || ''}`.trim();
    }

    const appRole = userData.role || userData.rol || APP_ROLES.MEMBER;

    return {
      ...userData,
      id: userData.id_miembro || userData.id,
      id_miembro: userData.id_miembro || userData.id,
      nombre_completo: nombreCompleto,
      correo_electronico: userData.correo_electronico || userData.email || '',
      role: appRole,
      // 'tipo' se conserva sólo si venía del backend (discriminador de inscripción),
      // no se sobrescribe con el rol de aplicación.
      tipo: userData.tipo || null,
      numero_telefono: userData.numero_telefono || '',
      semestre: userData.semestre || '',
      carrera: userData.carrera || ''
    };
  }, []);

  // Páginas desde las que tiene sentido expulsar a quien ya tiene sesión.
  // '/' NO está en la lista: es la portada pública del sitio, no una pantalla de
  // acceso. Tenerla aquí hacía imposible ver la home con la sesión iniciada (se
  // veía un parpadeo y saltaba a /admin o /dashboard). '/registro' tampoco
  // existe como ruta: el registro es una vista dentro de /iniciar.
  const redirectUser = useCallback((user) => {
    if (!user || !pathname) return;

    const authPages = ['/iniciar'];
    if (!authPages.includes(pathname)) return;

    // Si /iniciar lleva parámetros (`?registerEvent=N`, `?from=…`, `?recovery=1`)
    // la propia pantalla tiene un flujo que terminar y navega ella misma:
    // inscribir al evento y volver con `?registered=true`, o respetar el `from`.
    // Redirigir desde aquí desmontaba /iniciar con el POST de inscripción todavía
    // en vuelo. El proxy hace la misma excepción con `registerEvent`
    // (src/proxy.js), así que ambas capas se comportan igual.
    if (typeof window !== 'undefined' && window.location.search) return;

    const redirectPath = user.role === ROLES.ADMIN ? '/admin' : '/dashboard';
    router.replace(redirectPath);
  }, [pathname, router]);

  // Fetch del perfil una sola vez al montar el provider.
  // No depende de `pathname` para evitar refetch en cada navegación.
  useEffect(() => {
    let cancelled = false;
    const initializeAuth = async () => {
      try {
        const response = await getUserData();
        if (cancelled) return;
        if (response?.success && response.user) {
          setUser(normalizeUser(response.user));
        } else {
          setUser(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error initializing auth:', error);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    initializeAuth();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirección reactiva: corre cuando cambian el pathname o el user,
  // pero sin tocar la red.
  useEffect(() => {
    if (loading || !user) return;
    redirectUser(user);
  }, [pathname, user, loading, redirectUser]);

  // login/register NO redirigen: quien llama decide a dónde va (la pantalla de
  // /iniciar tiene que poder completar antes la inscripción a un evento). Antes
  // el router.replace de aquí competía con esa redirección y, según el momento,
  // desmontaba la pantalla con el POST de inscripción todavía en vuelo.
  const login = useCallback(async (email, password) => {
    try {
      const response = await loginUser({
        // El servidor normaliza igual; se manda ya limpio para que el intento no
        // se gaste por una mayúscula del autocorrector del móvil.
        correo_electronico: String(email || '').trim().toLowerCase(),
        contrasena: password
      });

      if (response?.success && response.user) {
        const normalizedUser = normalizeUser(response.user);
        setUser(normalizedUser);
        return { success: true, user: normalizedUser };
      } else {
        throw new Error(response?.error || 'Error en la autenticación');
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  }, [normalizeUser]);

  const register = useCallback(async (userData) => {
    try {
      const response = await registerUser(userData);

      if (response?.success) {
        if (response.user) {
          const normalizedUser = normalizeUser(response.user);
          setUser(normalizedUser);
          return { success: true, user: normalizedUser };
        }
        // Caso: Registro exitoso pero requiere login manual
        return { success: true, message: response.message };
      } else {
        throw new Error(response?.error || 'Error en el registro');
      }
    } catch (error) {
      console.error('Register error:', error);
      return {
        success: false,
        error: error.message || 'Ocurrió un error durante el registro'
      };
    }
  }, [normalizeUser]);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
      setUser(null);
      router.replace('/iniciar');
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
      router.replace('/iniciar');
      return { success: false, error: error.message };
    }
  }, [router]);

  const updateUser = useCallback((updatedData) => {
    setUser(prev => {
      if (!prev) return null;
      const normalized = normalizeUser({
        ...prev,
        ...updatedData
      });
      return normalized;
    });
  }, [normalizeUser]);

  // isAdmin/isMember/hasCompleteProfile se mantienen como FUNCIONES porque así
  // las llaman sus consumidores (ProtectedRoute hace `isAdmin()`), pero se
  // memorizan: antes eran funciones nuevas en cada render, y como ProtectedRoute
  // lista `isAdmin` en las dependencias de su efecto, ese efecto se disparaba
  // sin parar aunque no hubiera cambiado nada.
  const isAdmin = useCallback(() => isAdminRole(user?.role), [user]);
  const isMember = useCallback(() => !!user?.id_miembro && isMemberRole(user?.role), [user]);
  const hasCompleteProfile = useCallback(() => {
    if (!user) return false;
    return !!user.nombre_completo && !!user.correo_electronico && !!user.id_miembro;
  }, [user]);

  // Sin este useMemo el objeto del contexto cambiaba de identidad en cada render
  // del provider y arrastraba a re-renderizarse a TODOS los consumidores.
  const value = useMemo(() => ({
    user,
    loading,
    login,
    register,
    logout,
    updateUser,
    isAdmin,
    isAuthenticated: !!user,
    isMember,
    hasCompleteProfile,
  }), [user, loading, login, register, logout, updateUser, isAdmin, isMember, hasCompleteProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    console.warn('useAuth debe usarse dentro de un AuthProvider');
    return {
      user: null,
      loading: false,
      login: async () => ({ success: false, error: 'AuthProvider no disponible' }),
      register: async () => ({ success: false, error: 'AuthProvider no disponible' }),
      logout: async () => {},
      updateUser: () => {},
      isAdmin: () => false,
      isAuthenticated: false,
      isMember: () => false,
      hasCompleteProfile: () => false
    };
  }
  return context;
}