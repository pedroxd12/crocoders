'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';

import EventosAdmin from './eventos/page';
import MiembrosAdmin from './MiembrosAdmin/page';
import InvitadosAdmin from './InvitadosAdmin/page';
import GestionAdministradores from './GestionAdministradores/page';
import AdminProfile from './AdminProfile/page';
import EvidenciasAdmin from './evidencias/page';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('eventos');
  const router = useRouter();
  const { logout, user } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Sesión cerrada correctamente');
      router.push('/iniciar');
    } catch (error) {
      toast.error('Error al cerrar sesión');
      console.error('Logout error:', error);
    }
  };

  return (
    <ProtectedRoute adminOnly>
      <div className="min-h-screen bg-gray-900 text-white">
        <header className="bg-gray-800 p-4 shadow-lg">
          <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold text-green-400">Panel de Administración</h1>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setActiveTab('profile')}
                className="flex items-center gap-2 text-sm hover:text-green-400"
              >
                <span className="hidden sm:inline">Mi perfil</span>
                <span className="font-medium">{user?.nombre_completo || user?.email}</span>
              </button>
              <button 
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-6">
          {activeTab === 'profile' ? (
            <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
              <button 
                onClick={() => setActiveTab('eventos')}
                className="mb-4 text-green-400 hover:underline flex items-center"
              >
                ← Volver al panel de administración
              </button>
              <AdminProfile />
            </div>
          ) : (
            <>
              <div className="flex border-b border-gray-700 mb-6 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('eventos')}
                  className={`px-6 py-3 font-medium whitespace-nowrap ${activeTab === 'eventos' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}
                >
                  Eventos
                </button>
                <button
                  onClick={() => setActiveTab('miembros')}
                  className={`px-6 py-3 font-medium whitespace-nowrap ${activeTab === 'miembros' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}
                >
                  Miembros
                </button>
                <button
                  onClick={() => setActiveTab('invitados')}
                  className={`px-6 py-3 font-medium whitespace-nowrap ${activeTab === 'invitados' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}
                >
                  Invitados
                </button>
                <button
                  onClick={() => setActiveTab('admins')}
                  className={`px-6 py-3 font-medium whitespace-nowrap ${activeTab === 'admins' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}
                >
                  Administradores
                </button>
                <button
                  onClick={() => setActiveTab('evidencias')}
                  className={`px-6 py-3 font-medium whitespace-nowrap ${activeTab === 'evidencias' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}
                >
                  Evidencias
                </button>
              </div>

              <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
                {activeTab === 'eventos' && <EventosAdmin />}
                {activeTab === 'miembros' && <MiembrosAdmin />}
                {activeTab === 'invitados' && <InvitadosAdmin />}
                {activeTab === 'admins' && <GestionAdministradores />}
                {activeTab === 'evidencias' && <EvidenciasAdmin />}
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}