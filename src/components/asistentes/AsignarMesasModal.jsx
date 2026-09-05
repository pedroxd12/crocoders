'use client';

import { useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { esPorEquipos } from '@/lib/aforo';

/**
 * Reparto automático de mesas (panel de administración). La asignación de
 * una sola fila se hace en línea desde la tabla; esto numera de golpe todas
 * las inscripciones vivas contra POST /api/admin/eventos/[id]/mesas.
 */
export default function AsignarMesasModal({ isOpen, onClose, evento, eventoId, hayRetos, onAsignado }) {
  const porEquipos = esPorEquipos(evento);
  const [modo, setModo] = useState('secuencial');
  const [prefijo, setPrefijo] = useState('Mesa');
  const [inicio, setInicio] = useState('1');
  const [porMesa, setPorMesa] = useState('1');
  const [sobrescribir, setSobrescribir] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);

  const asignar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/eventos/${eventoId}/mesas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo,
          prefijo: prefijo.trim(),
          inicio: Number(inicio) || 1,
          ...(porEquipos ? {} : { por_mesa: Number(porMesa) || 1 }),
          sobrescribir,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudieron asignar las mesas');
      toast.success(
        data.asignadas === 0
          ? 'No había inscripciones sin mesa.'
          : `${data.asignadas} ${data.asignadas === 1 ? 'inscripción' : 'inscripciones'} en ${data.mesas_usadas} ${data.mesas_usadas === 1 ? 'mesa' : 'mesas'}.`,
      );
      onAsignado?.();
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setEnviando(false);
    }
  };

  const limpiar = async () => {
    setLimpiando(true);
    try {
      const res = await fetch(`/api/admin/eventos/${eventoId}/mesas`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudieron quitar las mesas');
      toast.success(`Se quitaron ${data.limpiadas} mesa(s).`);
      onAsignado?.();
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLimpiando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Asignar mesas automáticamente"
      description={
        porEquipos
          ? 'Una mesa por equipo, numeradas en orden de inscripción.'
          : 'Numera las inscripciones en orden de llegada; puedes sentar a varias personas por mesa.'
      }
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" color="red" onClick={limpiar} loading={limpiando} disabled={enviando}>
            Quitar todas
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={enviando || limpiando}>
            Cancelar
          </Button>
          <Button type="submit" form="formulario-mesas" loading={enviando} disabled={limpiando}>
            Asignar
          </Button>
        </>
      }
    >
      <form id="formulario-mesas" onSubmit={asignar} className="space-y-4">
        <Select
          label="Orden"
          value={modo}
          onChange={(e) => setModo(e.target.value)}
          options={[
            { value: 'secuencial', label: 'Por orden de inscripción' },
            ...(hayRetos ? [{ value: 'por_desafio', label: 'Agrupando por desafío' }] : []),
          ]}
          help={hayRetos ? 'Agrupar por desafío deja contiguos a los equipos del mismo reto.' : undefined}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Prefijo"
            value={prefijo}
            onChange={(e) => setPrefijo(e.target.value)}
            placeholder="Mesa"
            maxLength={20}
            help="Se numera como «Mesa 1», «Mesa 2»… Vacío = sólo el número."
          />
          <Input
            label="Empezar en"
            type="number"
            min="1"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </div>
        {!porEquipos && (
          <Input
            label="Personas por mesa"
            type="number"
            min="1"
            max="50"
            value={porMesa}
            onChange={(e) => setPorMesa(e.target.value)}
            help="Cuántas inscripciones comparten cada mesa."
            wrapperClassName="max-w-xs"
          />
        )}
        <label className="flex cursor-pointer items-start gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={sobrescribir}
            onChange={(e) => setSobrescribir(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          <span>
            Volver a numerar también las que ya tienen mesa. Sin marcar, sólo se asignan las que no tienen y
            la numeración continúa después de la más alta.
          </span>
        </label>
      </form>
    </Modal>
  );
}
