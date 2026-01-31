// context/authContext.js
'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { loginUser, logoutUser, getUserData, registerUser } from '@/lib/db-client';

export const AuthContext = createContext();

export const ROLES = {
  ADMIN: 'administrador',
  MEMBER: 'miembro',
  GUEST: 'invitado'
};

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

    return {
      ...userData,
      id: userData.id_miembro || userData.id,
      id_miembro: userData.id_miembro || userData.id,
      nombre_completo: nombreCompleto,
      correo_electronico: userData.correo_electronico || userData.email || '',
      role: userData.role || userData.tipo || ROLES.MEMBER,
      tipo: userData.tipo || userData.role || ROLES.MEMBER,
      numero_telefono: userData.numero_telefono || '',
      semestre: userData.semestre || '',
      carrera: userData.carrera || ''
    };
  }, []);

  const redirectUser = useCallback((user) => {
    if (!user || !pathname) return;
    
    const authPages = ['/iniciar', '/registro', '/'];
    if (authPages.includes(pathname)) {
      const redirectPath = user.role === ROLES.ADMIN ? '/admin' : '/dashboard';
      router.replace(redirectPath);
    }
  }, [pathname, router]);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const response = await getUserData();
        
        if (response?.success && response.user) {
          const normalizedUser = normalizeUser(response.user);
          setUser(normalizedUser);
          redirectUser(normalizedUser);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, [pathname, redirectUser, normalizeUser]);

  const login = async (email, password) => {
    try {
      const response = await loginUser({ 
        correo_electronico: email, 
        contrasena: password 
      });

      if (response?.success && response.user) {
        const normalizedUser = normalizeUser(response.user);
        setUser(normalizedUser);
        redirectUser(normalizedUser);
        return { success: true, user: normalizedUser };
      } else {
        throw new Error(response?.error || 'Error en la autenticación');
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  };

  const register = async (userData) => {
    try {
      const response = await registerUser(userData);

      if (response?.success) {
        if (response.user) {
          const normalizedUser = normalizeUser(response.user);
          setUser(normalizedUser);
          redirectUser(normalizedUser);
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
  };

  const logout = async () => {
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
  };

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

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateUser,
    isAdmin: () => user?.role === ROLES.ADMIN || user?.tipo === ROLES.ADMIN,
    isAuthenticated: !!user,
    isMember: () => !!user?.id_miembro && (user.role === ROLES.MEMBER || user.tipo === ROLES.MEMBER),
    hasCompleteProfile: () => {
      if (!user) return false;
      return !!user.nombre_completo && !!user.correo_electronico && !!user.id_miembro;
    }
  };

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