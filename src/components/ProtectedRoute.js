// ProtectedRoute.js
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/iniciar');
      } else if (adminOnly && !isAdmin()) {
        router.push('/dashboard');
      }
    }
  }, [user, loading, adminOnly, isAdmin, router]);

  if (loading || !user || (adminOnly && !isAdmin())) {
    return <div className="flex justify-center items-center h-screen">
      <p>Cargando...</p>
    </div>;
  }

  return children;
}