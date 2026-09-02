'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import {
  TALLAS_PLAYERA,
  NIVELES_ESTUDIO,
  CAMPO_ESTUDIOS_POR_NIVEL,
  SEMESTRES,
  ITLAC_NOMBRE,
  INSTITUCION_OPCIONES,
  CARRERAS_ITLAC,
} from '@/lib/registro-campos';

/**
 * Formulario de invitado COMPARTIDO por el listado de eventos, el detalle de
 * evento y los programas. Antes cada pantalla tenía el suyo: uno con catálogo
 * cerrado de carreras del ITL, otro con campo libre, ninguno preguntaba nivel
 * de estudios ni edad, y la talla no existía.
 *
 * La institución SE ELIGE: quien es del ITLAC selecciona su carrera del
 * catálogo oficial y da su número de control; quien viene de otra institución
 * escribe su escuela y la carrera/bachillerato es opcional. Antes era un campo
 * libre y la carrera se exigía igual a un alumno del ITLAC que a un externo de
 * secundaria.
 *
 * El estado vive en el PADRE (data/onChange): así cada pantalla decide cuándo
 * limpiarlo y puede mandar el payload con `limpiarInvitadoPayload`.
 */

export const INVITADO_VACIO = {
  nombre_completo: '',
  correo_electronico: '',
  numero_telefono: '',
  edad: '',
  nivel_estudios: '',
  // 'itlac' | 'otra'. Es estado de la interfaz: `limpiarInvitadoPayload` lo
  // traduce a `escuela_institucion` antes de enviar.
  institucion_tipo: '',
  escuela_institucion: '',
  carrera: '',
  numero_control: '',
  semestre: '',
  talla_playera: '',
};

/** Validación espejo de `invitadoSchema` (servidor), con mensajes por campo. */
export function validarInvitado(data, { requiereTalla = false } = {}) {
  const errors = {};
  if (!data.nombre_completo.trim()) errors.nombre_completo = 'Escribe tu nombre completo';
  if (!/\S+@\S+\.\S+/.test(data.correo_electronico)) errors.correo_electronico = 'Correo no válido';
  if (!/^[0-9]{10}$/.test(data.numero_telefono)) errors.numero_telefono = 'El teléfono debe tener 10 dígitos';

  const edad = Number(data.edad);
  if (!data.edad) errors.edad = 'Indica tu edad';
  else if (!Number.isInteger(edad) || edad < 5 || edad > 120) errors.edad = 'Edad no válida';

  if (!data.nivel_estudios) errors.nivel_estudios = 'Selecciona tu nivel de estudios';

  if (!data.institucion_tipo) {
    errors.institucion_tipo = 'Selecciona tu institución';
  } else if (data.institucion_tipo === 'itlac') {
    // Del ITLAC: carrera del catálogo, número de control y semestre.
    if (!data.carrera) errors.carrera = 'Selecciona tu carrera';
    if (!data.numero_control?.trim()) errors.numero_control = 'Indica tu número de control';
    if (!data.semestre) errors.semestre = 'Selecciona tu semestre';
  } else if (!data.escuela_institucion.trim()) {
    // Otra institución: sólo la escuela es obligatoria; la carrera es opcional.
    errors.escuela_institucion = 'Indica tu escuela o institución';
  }

  if (requiereTalla && !data.talla_playera) {
    errors.talla_playera = 'Selecciona tu talla de playera';
  }
  return errors;
}

/**
 * Convierte el estado del formulario en el payload de POST /api/invitados.
 * Los campos vacíos NO se envían: `semestre: ''` se convertía en 0 al validarlo
 * con zod en el servidor y devolvía un 400 antes de dar de alta al invitado.
 * `institucion_tipo` es estado de la interfaz: aquí se traduce al nombre real
 * de la escuela, y fuera del ITLAC no viajan número de control ni semestre.
 */
export function limpiarInvitadoPayload(data) {
  const payload = { ...data };
  if (payload.institucion_tipo === 'itlac') {
    payload.escuela_institucion = ITLAC_NOMBRE;
  } else {
    payload.numero_control = '';
    payload.semestre = '';
  }
  delete payload.institucion_tipo;
  return Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== '' && v != null),
  );
}

export function CamposInvitado({ data, errors = {}, onChange, requiereTalla = false }) {
  const set = (campo) => (e) => onChange({ ...data, [campo]: e.target.value });
  const campoEstudios = CAMPO_ESTUDIOS_POR_NIVEL[data.nivel_estudios];

  return (
    <div className="space-y-4">
      <Input
        label="Nombre completo"
        name="nombre_completo"
        value={data.nombre_completo}
        onChange={set('nombre_completo')}
        error={errors.nombre_completo}
        required
        placeholder="Como aparecerá en la lista de asistencia"
      />
      <Input
        label="Correo electrónico"
        type="email"
        name="correo_electronico"
        value={data.correo_electronico}
        onChange={set('correo_electronico')}
        error={errors.correo_electronico}
        required
        placeholder="correo@ejemplo.com"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Teléfono"
          name="numero_telefono"
          value={data.numero_telefono}
          onChange={(e) =>
            onChange({ ...data, numero_telefono: e.target.value.replace(/\D/g, '').slice(0, 10) })
          }
          error={errors.numero_telefono}
          required
          placeholder="10 dígitos"
        />
        <Input
          label="Edad"
          name="edad"
          inputMode="numeric"
          value={data.edad}
          onChange={(e) => onChange({ ...data, edad: e.target.value.replace(/\D/g, '').slice(0, 3) })}
          error={errors.edad}
          required
          placeholder="Ej. 19"
        />
      </div>

      <Select
        label="Nivel de estudios"
        name="nivel_estudios"
        value={data.nivel_estudios}
        onChange={(e) => {
          // Al cambiar de nivel se limpian carrera/semestre: lo escrito para
          // "universidad" no significa nada como "secundaria".
          onChange({ ...data, nivel_estudios: e.target.value, carrera: '', semestre: '' });
        }}
        options={NIVELES_ESTUDIO}
        placeholder="Selecciona tu nivel"
        error={errors.nivel_estudios}
        required
      />

      <Select
        label="Institución"
        name="institucion_tipo"
        value={data.institucion_tipo}
        onChange={(e) => {
          // Al cambiar de institución se limpian los campos que dependen de
          // ella: la carrera del catálogo del ITLAC no significa nada en otra
          // escuela, y viceversa.
          onChange({
            ...data,
            institucion_tipo: e.target.value,
            escuela_institucion: '',
            carrera: '',
            numero_control: '',
            semestre: '',
          });
        }}
        options={INSTITUCION_OPCIONES}
        placeholder="Selecciona tu institución"
        error={errors.institucion_tipo}
        required
      />

      {data.institucion_tipo === 'itlac' && (
        <>
          <Select
            label="Carrera"
            name="carrera"
            value={data.carrera}
            onChange={set('carrera')}
            options={CARRERAS_ITLAC}
            placeholder="Selecciona tu carrera"
            error={errors.carrera}
            required
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Número de control"
              name="numero_control"
              value={data.numero_control}
              onChange={(e) =>
                onChange({
                  ...data,
                  numero_control: e.target.value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(0, 20),
                })
              }
              error={errors.numero_control}
              required
              placeholder="Ej. 21560123"
            />
            <Select
              label="Semestre"
              name="semestre"
              value={data.semestre}
              onChange={set('semestre')}
              options={SEMESTRES}
              placeholder="Selecciona tu semestre"
              error={errors.semestre}
              required
            />
          </div>
        </>
      )}

      {data.institucion_tipo === 'otra' && (
        <>
          <Input
            label="Escuela o institución"
            name="escuela_institucion"
            value={data.escuela_institucion}
            onChange={set('escuela_institucion')}
            error={errors.escuela_institucion}
            required
            placeholder="Ej. Universidad Michoacana de San Nicolás de Hidalgo"
          />
          {campoEstudios && (
            <Input
              label={`${campoEstudios.label} (opcional)`}
              name="carrera"
              value={data.carrera}
              onChange={set('carrera')}
              error={errors.carrera}
              placeholder={campoEstudios.placeholder}
            />
          )}
        </>
      )}

      {requiereTalla && (
        <Select
          label="Talla de playera"
          name="talla_playera"
          value={data.talla_playera}
          onChange={set('talla_playera')}
          options={TALLAS_PLAYERA}
          placeholder="Selecciona tu talla"
          error={errors.talla_playera}
          required
          help="Este evento entrega playera o kit: la talla se usa para tu pedido."
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Institución de un INTEGRANTE DE EQUIPO. Mismo criterio que el formulario de
   invitado, compartido por el formulario público de equipos (/eventos/[id]) y
   el registro manual del admin: elegir ITLAC carga el catálogo de carreras y
   pide número de control; otra institución pide la escuela y deja la carrera
   opcional. Antes ambos eran campos de texto libres y obligatorios.
--------------------------------------------------------------------------- */

export const INTEGRANTE_EQUIPO_VACIO = {
  nombre: '',
  email: '',
  telefono: '',
  institucion_tipo: '',
  institucion: '',
  carrera: '',
  numero_control: '',
  semestre: '',
  talla_playera: '',
  es_capitan: false,
};

/**
 * Campos de institución de una fila de integrante. Se pintan como celdas
 * sueltas dentro del grid de la fila (por eso devuelve un fragmento).
 * `onPatch(patch)` mezcla el parche en el integrante correspondiente: cambiar
 * de institución limpia carrera/control en UNA sola actualización de estado.
 */
export function CamposInstitucionIntegrante({ data, onPatch }) {
  const tipo = data.institucion_tipo || '';
  return (
    <>
      <Select
        label="Institución"
        value={tipo}
        onChange={(e) =>
          onPatch({ institucion_tipo: e.target.value, institucion: '', carrera: '', numero_control: '' })
        }
        options={INSTITUCION_OPCIONES}
        placeholder="Selecciona la institución"
        required
      />
      {tipo === 'itlac' && (
        <>
          <Select
            label="Carrera"
            value={data.carrera || ''}
            onChange={(e) => onPatch({ carrera: e.target.value })}
            options={CARRERAS_ITLAC}
            placeholder="Selecciona la carrera"
            required
          />
          <Input
            label="Número de control"
            value={data.numero_control || ''}
            onChange={(e) =>
              onPatch({ numero_control: e.target.value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase().slice(0, 20) })
            }
            required
            placeholder="Ej. 21560123"
          />
        </>
      )}
      {tipo === 'otra' && (
        <>
          <Input
            label="Escuela o institución"
            value={data.institucion || ''}
            onChange={(e) => onPatch({ institucion: e.target.value })}
            required
            placeholder="Nombre de la escuela"
          />
          <Input
            label="Carrera/Bachillerato (opcional)"
            value={data.carrera || ''}
            onChange={(e) => onPatch({ carrera: e.target.value })}
            placeholder="Si aplica"
          />
        </>
      )}
    </>
  );
}

/** Mensaje de error si a algún integrante le falta su institución; null si ok. */
export function validarInstitucionIntegrantes(integrantes) {
  const falta = integrantes.some(
    (m) =>
      !m.institucion_tipo ||
      (m.institucion_tipo === 'itlac' && (!m.carrera || !m.numero_control?.trim())) ||
      (m.institucion_tipo === 'otra' && !m.institucion?.trim()),
  );
  return falta
    ? 'Completa la institución de cada integrante (carrera y número de control si son del ITLAC).'
    : null;
}

/**
 * Traduce las filas del formulario al payload del API: `institucion_tipo` es
 * estado de la interfaz, la institución real es el nombre del ITLAC o lo que
 * se haya escrito, y el número de control sólo viaja para alumnos del ITLAC.
 */
export function integrantesEquipoPayload(integrantes) {
  return integrantes.map(({ institucion_tipo, ...m }) => ({
    ...m,
    institucion: institucion_tipo === 'itlac' ? ITLAC_NOMBRE : m.institucion,
    numero_control: institucion_tipo === 'itlac' ? m.numero_control : '',
  }));
}

/**
 * Mini-modal para pedirle la talla a un MIEMBRO autenticado antes de confirmar
 * su inscripción a un evento con `solicitar_talla`. El registro de miembro es
 * de un clic; sin esto no había ningún punto del flujo donde preguntársela.
 */
export function TallaModal({ isOpen, onClose, onConfirm, loading = false, titulo }) {
  const [talla, setTalla] = useState('');
  const [error, setError] = useState('');

  const confirmar = () => {
    if (!talla) {
      setError('Selecciona tu talla de playera');
      return;
    }
    setError('');
    onConfirm(talla);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Talla de playera"
      description={titulo}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={confirmar} loading={loading}>
            Confirmar inscripción
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Este evento entrega playera o kit. Indica tu talla para completar la inscripción.
      </p>
      <Select
        label="Talla de playera"
        value={talla}
        onChange={(e) => setTalla(e.target.value)}
        options={TALLAS_PLAYERA}
        placeholder="Selecciona tu talla"
        error={error}
        required
      />
    </Modal>
  );
}
