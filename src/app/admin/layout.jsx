'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  Menu,
  X,
  Calendar,
  BookOpen,
} from 'lucide-react';

// Layout persistente del panel admin: el sidebar vive aquí, así permanece fijo
// en TODAS las rutas hijas (incluidas /admin/eventos/[id]/asistentes, etc.) y
// sólo cambia el área de contenido (children).
const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/eventos', label: 'Eventos', icon: Calendar },
  { href: '/admin/programas', label: 'Programas', icon: BookOpen },
  { href: '/admin/miembros', label: 'Miembros', icon: Users },
  { href: '/admin/invitados', label: 'Invitados', icon: UserPlus },
  { href: '/admin/admins', label: 'Administradores', icon: Shield },
  { href: '/admin/evidencias', label: 'Evidencias', icon: ImageIcon },
];

export default function AdminLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();
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

  // Un item está activo si la ruta coincide exactamente (Dashboard) o si la
  // ruta actual cuelga de su href (p.ej. /admin/eventos/5/asistentes → Eventos).
  const isActive = (item) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');

  const isProfileActive = pathname === '/admin/perfil' || pathname.startsWith('/admin/perfil/');

  return (
    <ProtectedRoute adminOnly>
      {/* h-screen (alto FIJO de viewport) + overflow-hidden: el scroll queda
          confinado al <main> interno, así el sidebar permanece estático y no se
          alarga con el contenido. */}
      <div className="h-screen bg-[#1a1a1a] text-gray-100 flex relative overflow-hidden">
        {/* Background Pattern */}
        <div className="dot-pattern fixed inset-0 z-0 pointer-events-none" />

        {/* Overlay para cerrar el sidebar en móvil */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar (persistente) */}
        <aside
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
              aria-label="Cerrar menú"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                    ${active
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-lg shadow-green-500/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'}
                  `}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10 space-y-2">
            <Link
              href="/admin/perfil"
              onClick={() => setIsSidebarOpen(false)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                ${isProfileActive
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
            </Link>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <LogOut size={20} />
              <span className="font-medium">Cerrar Sesión</span>
            </button>
          </div>
        </aside>

        {/* Área de contenido (lo único que cambia al navegar) */}
        <main className="flex-1 relative overflow-hidden z-10 flex flex-col">
          {/* Header móvil con botón de menú */}
          <header className="lg:hidden h-16 bg-gray-900/50 backdrop-blur-md border-b border-white/10 flex items-center px-4 justify-between shrink-0">
            <button
              className="p-2 bg-gray-800 rounded-lg border border-white/10 text-white"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Abrir menú"
            >
              <Menu size={24} />
            </button>
            <span className="font-bold text-white">Admin Panel</span>
            <div className="w-10" /> {/* Balance spacer */}
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
