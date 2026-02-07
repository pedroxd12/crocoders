'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { 
  LayoutDashboard, 
  Users, 
  UserPlus, 
  Shield, 
  Image as ImageIcon, 
  LogOut, 
  User,
  Menu,
  X,
  Calendar,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import DashboardHome from './DashboardHome/page';
import EventosAdmin from './eventos/page';
import MiembrosAdmin from './MiembrosAdmin/page';
import InvitadosAdmin from './InvitadosAdmin/page';
import GestionAdministradores from './GestionAdministradores/page';
import AdminProfile from './AdminProfile/page';
import EvidenciasAdmin from './evidencias/page';
import ProgramasAdmin from './programas/page';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'eventos', label: 'Eventos', icon: Calendar },
    { id: 'programas', label: 'Programas', icon: BookOpen },
    { id: 'miembros', label: 'Miembros', icon: Users },
    { id: 'invitados', label: 'Invitados', icon: UserPlus },
    { id: 'admins', label: 'Administradores', icon: Shield },
    { id: 'evidencias', label: 'Evidencias', icon: ImageIcon },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardHome />;
      case 'eventos': return <EventosAdmin />;
      case 'programas': return <ProgramasAdmin />;
      case 'miembros': return <MiembrosAdmin />;
      case 'invitados': return <InvitadosAdmin />;
      case 'admins': return <GestionAdministradores />;
      case 'evidencias': return <EvidenciasAdmin />;
      case 'profile': return <AdminProfile />;
      default: return <EventosAdmin />;
    }
  };

  return (
    <ProtectedRoute adminOnly>
      <div className="min-h-screen bg-[#1a1a1a] text-gray-100 flex relative overflow-hidden">
        {/* Background Pattern */}
        <div className="dot-pattern fixed inset-0 z-0 pointer-events-none" />

        {/* Mobile Sidebar Toggle - Moved to Main Content Header */}

        {/* Sidebar */}
        <AnimatePresence mode="wait">
          <motion.aside 
            className={`
              fixed lg:static inset-y-0 left-0 z-40 w-64 
              bg-gray-900/80 backdrop-blur-xl border-r border-white/10
              flex flex-col
              transform transition-transform duration-300 ease-in-out
              ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-600">
                  Admin Panel
                </h1>
                <p className="text-xs text-gray-400 mt-1">Gestión Club Crocoders</p>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden p-2 text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                      ${isActive 
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-lg shadow-green-500/10' 
                        : 'text-gray-400 hover:text-white hover:bg-white/5'}
                    `}
                  >
                    <Icon size={20} />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-white/10 space-y-2">
              <button 
                onClick={() => setActiveTab('profile')}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                  ${activeTab === 'profile' 
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'}
                `}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-green-400 to-emerald-600 flex items-center justify-center text-black font-bold text-sm">
                  {user?.nombre_completo?.charAt(0) || user?.email?.charAt(0) || 'A'}
                </div>
                <div className="flex-1 text-left overflow-hidden">
                  <p className="text-sm font-medium truncate">{user?.nombre_completo?.split(' ')[0] || 'Admin'}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
              </button>

              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              >
                <LogOut size={20} />
                <span className="font-medium">Cerrar Sesión</span>
              </button>
            </div>
          </motion.aside>
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 relative overflow-hidden z-10 flex flex-col">
           {/* Mobile Header */}
           <header className="lg:hidden h-16 bg-gray-900/50 backdrop-blur-md border-b border-white/10 flex items-center px-4 justify-between shrink-0">
             <button 
               className="p-2 bg-gray-800 rounded-lg border border-white/10 text-white"
               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
             >
               <Menu size={24} />
             </button>
             <span className="font-bold text-white">Admin Panel</span>
             <div className="w-10"></div> {/* Balance spacer */}
           </header>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-7xl mx-auto w-full">
             <motion.div
               key={activeTab}
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -20 }}
               transition={{ duration: 0.2 }}
             >
               {renderContent()}
             </motion.div>
           </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}