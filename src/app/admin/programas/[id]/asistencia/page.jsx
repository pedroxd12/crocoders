'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaArrowLeft, FaCertificate, FaDownload, FaCheckCircle, FaTimesCircle, FaUserPlus } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function ProgramaAsistencia() {
  const { id } = useParams();
  const router = useRouter();
  const [programa, setPrograma] = useState(null);
  const [asistencia, setAsistencia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usuariosDisponibles, setUsuariosDisponibles] = useState([]);
  const [selectedUsuario, setSelectedUsuario] = useState('');

  useEffect(() => {Promise.all([
      fetchPrograma(),
      fetchAsistencia(),
      fetchUsuariosDisponibles()
    ]).finally(() => setLoading(false));
  }, [id]);

  const fetchPrograma = async () => {
    try {
      const res = await fetch(`/api/admin/programas/${id}`);
      if (res.ok) {
        setPrograma(await res.json());
      }
    } catch (error) {
      toast.error('Error al cargar programa');
    }
  };

  const fetchAsistencia = async () => {
    try {
      const res = await fetch(`/api/admin/programas/${id}/asistencia`);
      if (res.ok) {
        setAsistencia(await res.json());
      }
    } catch (error) {
      toast.error('Error al cargar asistencia');
    }
  };

  const fetchUsuariosDisponibles = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        setUsuariosDisponibles(await res.json());
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const handleInscribir = async (e) => {
    e.preventDefault();
    if (!selectedUsuario) {
      toast.warning('Seleccione un usuario');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = JSON.parse(selectedUsuario);
      const res = await fetch(`/api/admin/programas/${id}/inscribir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_miembro: user.tipo === 'miembro' ? user.id : null,
          id_invitado: user.tipo === 'invitado' ? user.id : null
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al inscribir');
      }

      toast.success('Usuario inscrito correctamente');
      setIsModalOpen(false);
      setSelectedUsuario('');
      fetchAsistencia();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const emitirCertificado = async (row) => {
    try {
      const res = await fetch(`/api/admin/programas/${id}/asistencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_miembro: row.tipo === 'miembro' ? row.id_miembro : null,
          id_invitado: row.tipo === 'invitado' ? row.id_invitado : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al emitir certificado');
      toast.success('Certificado emitido correctamente');
      fetchAsistencia();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const exportarCSV = () => {
    // Escapar valores con comillas para no romper el CSV ante comas/comillas.
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ['Nombre', 'Email', 'Teléfono', 'Tipo', 'Sesiones Asistidas', '% Asistencia', 'Elegible Certificado', 'Certificado Emitido'];
    const rows = asistencia.map(a => [
      a.nombre_completo,
      a.email,
      a.telefono || '',
      a.tipo,
      a.sesiones_asistidas,
      `${a.porcentaje_asistencia}%`,
      a.elegible_certificado ? 'Sí' : 'No',
      a.certificado_emitido ? 'Sí' : 'No'
    ]);

    const csv = [headers, ...rows].map(row => row.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const nombreSafe = (programa?.nombre || 'programa').replace(/\s+/g, '_');
    link.download = `asistencia_${nombreSafe}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const usuariosYaInscritos = asistencia.map(a => ({
    id: a.id_miembro || a.id_invitado,
    tipo: a.tipo
  }));

  const usuariosFiltrados = usuariosDisponibles.filter(u => 
    !usuariosYaInscritos.some(yi => yi.id === u.id && yi.tipo === u.tipo)
  );

  if (loading) return <LoadingSpinner />;

  const elegibles = asistencia.filter(a => a.elegible_certificado && !a.certificado_emitido);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button onClick={() => router.back()} variant="text" className="text-gray-400 hover:text-white mb-4 flex items-center gap-2">
          <FaArrowLeft /> Volver a Programas
        </Button>

        {programa && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
              <FaCertificate /> Reporte de Asistencia
            </h1>
            <h2 className="text-xl text-gray-400 mb-4">{programa.nombre}</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-white">{asistencia.length}</div>
                <div className="text-xs text-gray-400">Total Inscritos</div>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-400">{elegibles.length}</div>
                <div className="text-xs text-gray-400">Elegibles Certificado</div>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {asistencia.filter(a => a.certificado_emitido).length}
                </div>
                <div className="text-xs text-gray-400">Certificados Emitidos</div>
              </div>
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-400">{programa.total_sesiones}</div>
                <div className="text-xs text-gray-400">Total Sesiones</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-white">Participantes</h2>
        <div className="flex gap-2">
          <Button onClick={() => setIsModalOpen(true)} variant="primary">
            <FaUserPlus /> Inscribir Usuario
          </Button>
          <Button onClick={exportarCSV} variant="secondary">
            <FaDownload /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-md p-4">
        <Table
          columns={[
            { key: 'nombre_completo', label: 'Nombre' },
            { key: 'email', label: 'Email' },
            { 
              key: 'tipo', 
              label: 'Tipo',
              render: (row) => (
                <span className={`px-2 py-1 rounded text-xs ${row.tipo === 'miembro' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                  {row.tipo}
                </span>
              )
            },
            { 
              key: 'sesiones_asistidas', 
              label: 'Sesiones',
              cellClassName: 'text-center font-bold'
            },
            { 
              key: 'porcentaje_asistencia', 
              label: '% Asistencia',
              render: (row) => {
                const porcentaje = parseFloat(row.porcentaje_asistencia);
                const color = porcentaje >= 80 ? 'text-green-400' : porcentaje >= 50 ? 'text-yellow-400' : 'text-red-400';
                return <span className={`font-bold ${color}`}>{porcentaje.toFixed(1)}%</span>;
              },
              cellClassName: 'text-center'
            },
            {
              key: 'elegible_certificado',
              label: 'Elegible',
              render: (row) => row.elegible_certificado ? (
                <FaCheckCircle className="text-green-400 text-xl" />
              ) : (
                <FaTimesCircle className="text-gray-500 text-xl" />
              ),
              cellClassName: 'text-center'
            },
            {
              key: 'certificado_emitido',
              label: 'Certificado',
              render: (row) => row.certificado_emitido ? (
                <span className="px-2 py-1 bg-green-600 rounded text-xs">Emitido</span>
              ) : row.elegible_certificado ? (
                <Button
                  variant="text"
                  size="sm"
                  className="text-blue-400 hover:text-blue-300"
                  onClick={() => emitirCertificado(row)}
                >
                  Emitir
                </Button>
              ) : (
                <span className="text-gray-500 text-xs">No elegible</span>
              ),
              cellClassName: 'text-center'
            }
          ]}
          data={asistencia}
          emptyMessage="No hay participantes inscritos aún"
          className="w-full"
          headerClassName="bg-gray-700 text-gray-300"
          rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Inscribir Usuario al Programa"
      >
        <form onSubmit={handleInscribir} className="space-y-4">
          <Select
            label="Seleccionar Usuario *"
            value={selectedUsuario}
            onChange={(e) => setSelectedUsuario(e.target.value)}
            options={usuariosFiltrados.map(u => ({
              value: JSON.stringify({ id: u.id, tipo: u.tipo }),
              label: `${u.nombre_completo} (${u.email}) - ${u.tipo}`
            }))}
            required
          />

          <div className="bg-blue-900/30 border border-blue-700 rounded p-3 text-sm text-blue-300">
            <strong>Nota:</strong> El usuario será inscrito al programa completo. Su asistencia se actualizará automáticamente cuando asista a las sesiones individuales.
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" onClick={() => setIsModalOpen(false)} variant="secondary">
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? <LoadingSpinner size="sm" /> : 'Inscribir'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
