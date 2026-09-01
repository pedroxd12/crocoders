'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Skeleton } from '@/components/ui/Skeleton';
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

// Espera de la verificación de sesión CON la forma del contenido real (título +
// tabla). Antes esta espera borraba la pantalla entera, sidebar incluido.
function EsqueletoContenido() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando sección">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-10 w-40" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
      <span className="sr-only">Cargando sección…</span>
    </div>
  );
}

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
    // h-screen (alto FIJO de viewport) + overflow-hidden: el scroll queda
    // confinado al <main> interno, así el sidebar permanece estático y no se
    // alarga con el contenido.
    <div className="h-screen bg-bg text-fg flex relative overflow-hidden">
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

      {/* Sidebar (persistente). Se pinta SIEMPRE, también mientras se verifica
          la sesión: es el marco de referencia del panel y hacerlo desaparecer
          en cada navegación era la mitad de la sensación de lentitud. */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40 w-64
          bg-surface border-r border-line
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="p-5 border-b border-line flex justify-between items-center gap-2">
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight text-fg">Panel de administración</p>
            <p className="text-xs text-muted mt-0.5 truncate">Club Crocoders</p>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-muted hover:text-fg"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsSidebarOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                  ${active
                    ? 'bg-brand-soft text-brand font-medium'
                    : 'text-muted hover:text-fg hover:bg-surface-2'}
                `}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-line space-y-1">
          <Link
            href="/admin/perfil"
            onClick={() => setIsSidebarOpen(false)}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
              ${isProfileActive ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg hover:bg-surface-2'}
            `}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand font-semibold text-sm">
              {user?.nombre_completo?.charAt(0) || user?.email?.charAt(0) || 'A'}
            </span>
            <span className="flex-1 text-left overflow-hidden">
              <span className="block text-sm font-medium truncate">
                {user?.nombre_completo?.split(' ')[0] || 'Admin'}
              </span>
              <span className="block text-xs text-faint truncate">{user?.correo_electronico || user?.email}</span>
            </span>
          </Link>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:bg-danger-soft hover:text-danger transition-colors"
          >
            <LogOut size={18} aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Área de contenido (lo único que cambia al navegar) */}
      <main className="flex-1 relative overflow-hidden z-10 flex flex-col">
        {/* Header móvil con botón de menú */}
        <header className="lg:hidden h-16 bg-surface border-b border-line flex items-center px-4 justify-between shrink-0">
          <button
            className="p-2 bg-surface-2 rounded-lg border border-line text-fg"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Abrir menú"
          >
            <Menu size={24} />
          </button>
          <span className="font-semibold text-fg">Administración</span>
          <div className="w-10" /> {/* Balance spacer */}
        </header>

        {/* data-scroll-lock: en /admin el <body> no scrollea nunca (el scroll
            vive aquí dentro), así que Modal necesita saber cuál es el elemento
            real que debe congelar al abrirse; si no, el fondo seguía moviéndose
            bajo el diálogo. */}
        <div
          data-scroll-lock
          className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-7xl mx-auto w-full"
        >
          {/* La protección envuelve sólo al contenido: el sidebar sigue en pie
              mientras se verifica la sesión. */}
          <ProtectedRoute adminOnly fallback={<EsqueletoContenido />}>
            {children}
          </ProtectedRoute>
        </div>
      </main>
    </div>
  );
}
