'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FaUser, FaEnvelope, FaPhone, FaCode, FaSave, FaTimes, FaEdit } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function UserProfile() {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    nombre_completo: '',
    correo_electronico: '',
    numero_telefono: '',
    usuario_codeforces: '',
    usuario_vjudge: '',
    usuario_omegaup: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/user/profile', {
          credentials: 'include'
        });
        
        if (!res.ok) throw new Error('Error al cargar perfil');
        
        const data = await res.json();
        
        if (data.success) {
          setFormData({
            nombre_completo: data.user.nombre_completo || data.user.name || '',
            correo_electronico: data.user.email || '',
            numero_telefono: data.user.numero_telefono || '',
            usuario_codeforces: data.user.usuario_codeforces || '',
            usuario_vjudge: data.user.usuario_vjudge || '',
            usuario_omegaup: data.user.usuario_omegaup || ''
          });
        }
      } catch (error) {
        toast.error(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData),
        credentials: 'include'
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al actualizar perfil');
      }
      
      const data = await res.json();
      toast.success(data.message || 'Perfil actualizado correctamente');
      setEditMode(false);
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-green-400">Mi Perfil</h2>
        {!editMode ? (
          <Button onClick={() => setEditMode(true)} variant="primary">
            <FaEdit className="mr-2" /> Editar Perfil
          </Button>
        ) : (
          <Button onClick={() => setEditMode(false)} variant="secondary">
            <FaTimes className="mr-2" /> Cancelar
          </Button>
        )}
      </div>

      {editMode ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nombre Completo"
              name="nombre_completo"
              value={formData.nombre_completo}
              onChange={handleInputChange}
              required
              icon={<FaUser />}
            />
            <Input
              label="Correo Electrónico"
              name="correo_electronico"
              value={formData.correo_electronico}
              onChange={handleInputChange}
              type="email"
              required
              disabled
              icon={<FaEnvelope />}
            />
            <Input
              label="Teléfono"
              name="numero_telefono"
              value={formData.numero_telefono}
              onChange={handleInputChange}
              type="tel"
              icon={<FaPhone />}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <h3 className="col-span-full text-lg font-semibold text-green-400">Perfiles en Plataformas</h3>
            <Input
              label="Codeforces"
              name="usuario_codeforces"
              value={formData.usuario_codeforces}
              onChange={handleInputChange}
              icon={<FaCode />}
            />
            <Input
              label="VJudge"
              name="usuario_vjudge"
              value={formData.usuario_vjudge}
              onChange={handleInputChange}
              icon={<FaCode />}
            />
            <Input
              label="OmegaUp"
              name="usuario_omegaup"
              value={formData.usuario_omegaup}
              onChange={handleInputChange}
              icon={<FaCode />}
            />
          </div>

          <div className="flex justify-end mt-6">
            <Button type="submit" variant="primary">
              <FaSave className="mr-2" /> Guardar Cambios
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-700/50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-4 text-green-400">Información Personal</h3>
            <div className="space-y-4">
              <div>
                <p className="text-gray-400 text-sm">Nombre Completo</p>
                <p className="text-lg">{formData.nombre_completo}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Correo Electrónico</p>
                <p className="text-lg">{formData.correo_electronico}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Teléfono</p>
                <p className="text-lg">{formData.numero_telefono || 'No especificado'}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-700/50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-4 text-green-400">Perfiles en Plataformas</h3>
            <div className="space-y-4">
              <div>
                <p className="text-gray-400 text-sm">Codeforces</p>
                <p className="text-lg">{formData.usuario_codeforces || 'No registrado'}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">VJudge</p>
                <p className="text-lg">{formData.usuario_vjudge || 'No registrado'}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">OmegaUp</p>
                <p className="text-lg">{formData.usuario_omegaup || 'No registrado'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}