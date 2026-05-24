'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { FaArrowLeft, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function SesionAsistencia() {
  const { id, idSesion } = useParams();
  const router = useRouter();
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // clave del que se está guardando

  useEffect(() => {
    fetchAsistencia().finally(() => setLoading(false));
  }, [id, idSesion]);

  const fetchAsistencia = async () => {
    try {
      const res = await fetch(`/api/admin/programas/${id}/sesiones/${idSesion}/asistencia`);
      if (res.ok) {
        setLista(await res.json());
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al cargar asistencia');
      }
    } catch (error) {
      toast.error('Error al cargar asistencia');
    }
  };

  const toggle = async (row) => {
    const clave = `${row.tipo}-${row.id_miembro || row.id_invitado}`;
    setSaving(clave);
    const nuevoValor = !row.asistio;
    try {
      const res = await fetch(`/api/admin/programas/${id}/sesiones/${idSesion}/asistencia`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_miembro: row.tipo === 'miembro' ? row.id_miembro : null,
          id_invitado: row.tipo === 'invitado' ? row.id_invitado : null,
          asistio: nuevoValor,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar');
      }
      setLista(prev => prev.map(p =>
        (p.id_miembro === row.id_miembro && p.id_invitado === row.id_invitado)
          ? { ...p, asistio: nuevoValor } : p));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="container mx-auto px-4 py-8">
      <Button onClick={() => router.back()} variant="text" className="text-gray-400 hover:text-white mb-4 flex items-center gap-2">
        <FaArrowLeft /> Volver a Sesiones
      </Button>

      <h1 className="text-2xl font-bold text-white mb-6">Registro de Asistencia — Sesión #{idSesion}</h1>

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
              ),
            },
            {
              key: 'asistio',
              label: 'Asistencia',
              render: (row) => {
                const clave = `${row.tipo}-${row.id_miembro || row.id_invitado}`;
                return (
                  <Button
                    variant="text"
                    size="sm"
                    disabled={saving === clave}
                    onClick={() => toggle(row)}
                    className={row.asistio ? 'text-green-400' : 'text-gray-500'}
                  >
                    {row.asistio ? <FaCheckCircle className="text-xl" /> : <FaTimesCircle className="text-xl" />}
                  </Button>
                );
              },
              cellClassName: 'text-center',
            },
          ]}
          data={lista}
          emptyMessage="No hay inscritos al programa todavía"
          className="w-full"
          headerClassName="bg-gray-700 text-gray-300"
          rowClassName="border-b border-gray-700 hover:bg-gray-700/50"
        />
      </div>
    </div>
  );
}
