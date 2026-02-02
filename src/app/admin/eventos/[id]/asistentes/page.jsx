'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaArrowLeft, FaCheck, FaTimes, FaSearch, FaFileInvoiceDollar, FaUserPlus, FaQrcode } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function EventoAsistentes() {
  const { id } = useParams();
  const router = useRouter();
  const [asistentes, setAsistentes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventoInfo, setEventoInfo] = useState({ nombre: '', fecha: '' });
  
  // Manual Registration State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [usersCatalog, setUsersCatalog] = useState([]);
  const [selectedUserJson, setSelectedUserJson] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    fetchAsistentes();
    fetchUsersCatalog();
  }, [id]);

  const fetchUsersCatalog = async () => {
    try {
        const res = await fetch('/api/admin/users');
        if (res.ok) {
            const data = await res.json();
            setUsersCatalog(data);
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
  };

  const fetchAsistentes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/eventos/${id}/asistentes`);
      if (!res.ok) throw new Error('Error al cargar asistentes');
      const data = await res.json();
      setAsistentes(data);
      if (data.length > 0) {
        setEventoInfo({ 
            nombre: data[0].nombre_evento, 
            fecha: data[0].fecha_inicio 
        });
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAsistencia = async (inscripcionId, currentStatus) => {
    try {
      const res = await fetch(`/api/admin/inscripciones/${inscripcionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_asistencia', value: !currentStatus })
      });
      if (!res.ok) throw new Error('Error al actualizar');
      
      setAsistentes(prev => prev.map(a => 
        a.id_inscripcion === inscripcionId ? { ...a, asistio: !currentStatus } : a
      ));
      toast.success(currentStatus ? 'Asistencia eliminada' : 'Asistencia registrada');
    } catch (error) {
      toast.error('No se pudo actualizar la asistencia');
    }
  };

  const togglePago = async (inscripcionId, currentStatus) => {
    if (!confirm(`¿Confirmar que el pago ha sido ${!currentStatus ? 'COMPLETADO' : 'CANCELADO'}?`)) return;

    try {
      const res = await fetch(`/api/admin/inscripciones/${inscripcionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_pago', value: !currentStatus })
      });
      if (!res.ok) throw new Error('Error al actualizar');
      
      setAsistentes(prev => prev.map(a => 
        a.id_inscripcion === inscripcionId ? { ...a, pago_completado: !currentStatus } : a
      ));
      toast.success('Estado de pago actualizado');
    } catch (error) {
      toast.error('No se pudo actualizar el pago');
    }
  };

  const handleManualRegister = async (e) => {
    e.preventDefault();
    if (!selectedUserJson) {
        toast.warning('Seleccione un usuario');
        return;
    }

    setIsRegistering(true);
    try {
        const user = JSON.parse(selectedUserJson);
        const res = await fetch('/api/admin/eventos/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                id_evento: id,
                id_usuario: user.id,
                tipo_usuario: user.tipo
            })
        });

        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Error al registrar');

        toast.success(`Usuario ${user.nombre_completo} registrado correctamente`);
        setIsRegisterModalOpen(false);
        setSelectedUserJson('');
        fetchAsistentes(); // Reload list
    } catch (error) {
        toast.error(error.message);
    } finally {
        setIsRegistering(false);
    }
  };

  const handleScanQR = () => {
    toast.info('Funcionalidad de escaneo QR en desarrollo. Por favor use el registro manual por ahora.');
  };

  const filteredAsistentes = asistentes.filter(a => 
    a.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.correo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.numero_ieee?.includes(searchTerm)
  );
  
  // Filter out users already registered to avoid duplicates in dropdown
  const availableUsers = usersCatalog.filter(u => 
    !asistentes.some(a => (a.id_miembro === u.id && u.tipo === 'miembro') || (a.id_invitado === u.id && u.tipo === 'invitado'))
  );

  if (isLoading) return <div className="flex justify-center h-screen items-center"><LoadingSpinner text="Cargando lista..." /></div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button onClick={() => router.back()} variant="text" className="mb-4 text-gray-400 hover:text-white flex items-center gap-2">
            <FaArrowLeft /> Volver a Eventos
        </Button>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold text-white">Lista de Asistencia</h1>
                {eventoInfo.nombre && (
                    <p className="text-gray-400 text-sm mt-1">
                        Evento: <span className="text-green-400 font-semibold">{eventoInfo.nombre}</span> 
                        <span className="mx-2">|</span> 
                        Fecha: {new Date(eventoInfo.fecha).toLocaleDateString()}
                    </p>
                )}
            </div>
            <div className="flex gap-4">
                 <div className="bg-gray-800 p-2 rounded-lg text-center min-w-[100px]">
                    <div className="text-2xl font-bold text-white">{asistentes.length}</div>
                    <div className="text-xs text-gray-400">Inscritos</div>
                 </div>
                 <div className="bg-gray-800 p-2 rounded-lg text-center min-w-[100px]">
                    <div className="text-2xl font-bold text-green-400">{asistentes.filter(a => a.asistio).length}</div>
                    <div className="text-xs text-gray-400">Asistieron</div>
                 </div>
            </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-md p-4 mb-4 flex flex-col md:flex-row gap-4 justify-between items-center">
        <Input 
            placeholder="Buscar por nombre, correo o IEEE..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-gray-700 border-gray-600 focus:border-green-500 w-full md:w-96"
            icon={<FaSearch className="text-gray-400"/>}
        />
        <div className="flex gap-2 w-full md:w-auto">
            <Button onClick={handleScanQR} variant="secondary" className="flex items-center gap-2">
                <FaQrcode /> <span className="hidden sm:inline">Escanear QR</span>
            </Button>
            <Button onClick={() => setIsRegisterModalOpen(true)} variant="primary" className="flex items-center gap-2">
                <FaUserPlus /> <span className="hidden sm:inline">Registrar Manualmente</span>
            </Button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <Table
          columns={[
            { header: 'Nombre', accessor: 'nombre_completo', cellClassName: 'font-medium text-white py-3 px-4' },
            { header: 'Correo', accessor: 'correo', cellClassName: 'text-gray-400 text-sm py-3 px-4' },
            { header: 'Tipo', accessor: 'tipo_usuario', cellClassName: 'text-xs text-gray-500 py-3 px-4' },
            { 
              header: 'Estado Pago', 
              render: (row) => (
                row.requiere_pago ? (
                    <button 
                        onClick={() => togglePago(row.id_inscripcion, row.pago_completado)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition ${row.pago_completado ? 'bg-green-900/50 text-green-400 border border-green-500/30' : 'bg-red-900/50 text-red-400 border border-red-500/30'}`}
                        title="Clic para cambiar estado de pago"
                    >
                        {row.pago_completado ? <><FaCheck size={10}/> PAGADO</> : <><FaTimes size={10}/> PENDIENTE</>}
                    </button>
                ) : <span className="text-xs text-gray-500">Gratuito</span>
              ),
              cellClassName: 'py-3 px-4' 
            },
            { 
              header: 'Asistencia', 
              render: (row) => (
                <button 
                    onClick={() => toggleAsistencia(row.id_inscripcion, row.asistio)}
                    className={`flex items-center justify-center w-8 h-8 rounded-full transition ${row.asistio ? 'bg-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                    title={row.asistio ? "Marcar como no asistió" : "Marcar asistencia"}
                >
                    {row.asistio ? <FaCheck /> : <div className="w-2 h-2 rounded-full bg-gray-500"></div>}
                </button>
              ),
              cellClassName: 'py-3 px-4 text-center' 
            }
          ]}
          data={filteredAsistentes}
          emptyMessage="No hay asistentes registrados"
          className="w-full"
          headerClassName="bg-gray-700 text-gray-300"
          rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
        />
      </div>

      {/* Manual Register Modal */}
      <Modal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        title="Registrar Asistente Manualmente"
      >
        <form onSubmit={handleManualRegister} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Seleccionar Usuario</label>
                <select 
                    value={selectedUserJson} 
                    onChange={(e) => setSelectedUserJson(e.target.value)}
                    className="w-full p-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-green-500 min-h-[150px]"
                    size="5" 
                >
                    <option value="" disabled>-- Seleccione un usuario --</option>
                    {availableUsers.map(user => (
                        <option key={`${user.tipo}-${user.id}`} value={JSON.stringify(user)} className="py-1">
                            {user.nombre_completo} ({user.tipo}) - {user.email}
                        </option>
                    ))}
                    {availableUsers.length === 0 && <option disabled>No hay usuarios disponibles para registrar</option>}
                </select>
                <p className="text-xs text-gray-400 mt-2">
                    Lista de usuarios (miembros e invitados) que aún no están inscritos en este evento.
                </p>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
                <Button type="button" onClick={() => setIsRegisterModalOpen(false)} variant="secondary">Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isRegistering}>
                    {isRegistering ? <LoadingSpinner size="sm" /> : 'Registrar Usuario'}
                </Button>
            </div>
        </form>
      </Modal>
    </div>
  );
}
