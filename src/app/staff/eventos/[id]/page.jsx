'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaArrowLeft, FaQrcode, FaSearch, FaCheckCircle, FaTimesCircle, FaCalendarAlt, FaMapMarkerAlt, FaClock } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Table from '@/components/ui/Table';
import LoadingSpinner from '@/components/LoadingSpinner';
import QRScannerModal from '@/components/QRScannerModal';

export default function StaffEventoDetalle() {
  const { id } = useParams();
  const router = useRouter();
  const [evento, setEvento] = useState(null);
  const [miRol, setMiRol] = useState(null);
  const [asistentes, setAsistentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchEventoInfo(),
      fetchAsistentes()
    ]).finally(() => setLoading(false));
  }, [id]);

  const fetchEventoInfo = async () => {
    try {
      const res = await fetch(`/api/staff/eventos/${id}`);
      if (!res.ok) {
        if (res.status === 403) {
          toast.error('No tienes permisos para ver este evento');
          router.push('/staff');
          return;
        }
        throw new Error('Error al cargar evento');
      }
      const data = await res.json();
      setEvento(data.evento);
      setMiRol(data.mi_rol);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const fetchAsistentes = async () => {
    try {
      const res = await fetch(`/api/staff/eventos/${id}/asistentes`);
      if (res.ok) {
        setAsistentes(await res.json());
      }
    } catch (error) {
      console.error('Error loading asistentes:', error);
    }
  };

  const handleQRSuccess = (data) => {
    toast.success(`Asistencia registrada: ${data.nombre}`);
    fetchAsistentes();
  };

  const filteredAsistentes = asistentes.filter(a =>
    a.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.correo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.numero_ieee?.includes(searchTerm)
  );

  if (loading) return <LoadingSpinner />;

  const asistenciaPercentage = asistentes.length > 0
    ? Math.round((asistentes.filter(a => a.asistio).length / asistentes.length) * 100)
    : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button onClick={() => router.back()} variant="text" className="text-gray-400 hover:text-white mb-4 flex items-center gap-2">
          <FaArrowLeft /> Volver al Dashboard
        </Button>

        {evento && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            {evento.imagen_url && (
              <div 
                className="h-48 rounded-lg bg-cover bg-center mb-4"
                style={{ backgroundImage: `url(${evento.imagen_url})` }}
              />
            )}

            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">{evento.nombre}</h1>
                <p className="text-gray-400">{evento.descripcion}</p>
              </div>
              {miRol && (
                <div className="bg-green-600 px-4 py-2 rounded-lg">
                  <p className="text-xs text-green-200">Mi Rol</p>
                  <p className="text-white font-bold">{miRol.rol}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="flex items-center gap-2 text-gray-300">
                <FaCalendarAlt className="text-green-400" />
                <div>
                  <p className="text-xs text-gray-400">Fecha</p>
                  <p className="font-semibold">{new Date(evento.fecha_inicio).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-gray-300">
                <FaClock className="text-blue-400" />
                <div>
                  <p className="text-xs text-gray-400">Horario</p>
                  <p className="font-semibold">{evento.hora_inicio} - {evento.hora_fin}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-gray-300">
                <FaMapMarkerAlt className="text-purple-400" />
                <div>
                  <p className="text-xs text-gray-400">Ubicación</p>
                  <p className="font-semibold">{evento.ubicacion || 'Por definir'}</p>
                </div>
              </div>

              <div className="bg-gray-700 p-3 rounded-lg text-center">
                <p className="text-xs text-gray-400">Asistencia</p>
                <p className="text-2xl font-bold text-green-400">{asistenciaPercentage}%</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-white">{evento.total_inscritos}</div>
                <div className="text-xs text-gray-400">Inscritos</div>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-400">{evento.total_asistieron}</div>
                <div className="text-xs text-gray-400">Asistieron</div>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-400">{evento.pagos_completados || 0}</div>
                <div className="text-xs text-gray-400">Pagos</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Herramientas de Staff */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">Herramientas de Asistencia</h2>
        <div className="flex flex-col md:flex-row gap-4">
          <Button
            onClick={() => setIsQRScannerOpen(true)}
            variant="primary"
            className="flex-1"
          >
            <FaQrcode /> Escanear QR de Asistencia
          </Button>
          
          <Input
            placeholder="Buscar asistente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={<FaSearch />}
            className="flex-1"
          />
        </div>
      </div>

      {/* Lista de Asistentes */}
      <div className="bg-gray-800 rounded-lg shadow-md p-4">
        <h2 className="text-xl font-bold text-white mb-4">Lista de Asistentes</h2>
        <Table
          columns={[
            { key: 'nombre_completo', label: 'Nombre' },
            { key: 'correo', label: 'Email' },
            { 
              key: 'tipo', 
              label: 'Tipo',
              render: (row) => {
                const colors = {
                  miembro: 'bg-blue-600',
                  invitado: 'bg-purple-600',
                  equipo: 'bg-orange-600'
                };
                return (
                  <span className={`px-2 py-1 rounded text-xs ${colors[row.tipo] || 'bg-gray-600'}`}>
                    {row.tipo}
                  </span>
                );
              }
            },
            {
              key: 'asistio',
              label: 'Asistencia',
              render: (row) => (
                <div className="flex items-center justify-center">
                  {row.asistio ? (
                    <FaCheckCircle className="text-green-400 text-xl" />
                  ) : (
                    <FaTimesCircle className="text-gray-500 text-xl" />
                  )}
                </div>
              ),
              cellClassName: 'text-center'
            },
            {
              key: 'fecha_inscripcion',
              label: 'Inscrito',
              render: (row) => new Date(row.fecha_inscripcion).toLocaleDateString()
            }
          ]}
          data={filteredAsistentes}
          emptyMessage={searchTerm ? 'No se encontraron asistentes' : 'No hay asistentes registrados'}
          className="w-full"
          headerClassName="bg-gray-700 text-gray-300"
          rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
        />

        {asistentes.length > 0 && (
          <div className="mt-4 text-center text-gray-400 text-sm">
            Mostrando {filteredAsistentes.length} de {asistentes.length} asistentes
          </div>
        )}
      </div>

      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onSuccess={handleQRSuccess}
      />
    </div>
  );
}
