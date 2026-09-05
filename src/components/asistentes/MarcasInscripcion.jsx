'use client';

import { useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

/**
 * Marcas manuales sobre una inscripción individual (asistencia y pago) contra
 * PATCH /api/eventos/inscripciones/[id]. Las usa el panel de administración y,
 * con rol de gestión, el de staff; `parchear(idInscripcion, cambios)` actualiza
 * la fila en la lista local sin volver a pedirla entera.
 */
export function useMarcasInscripcion({ parchear }) {
  const [pagoAConfirmar, setPagoAConfirmar] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const enviar = useCallback(async (idInscripcion, action, value) => {
    const res = await fetch(`/api/eventos/inscripciones/${idInscripcion}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo actualizar');
    return data;
  }, []);

  const toggleAsistencia = useCallback(
    async (fila) => {
      try {
        await enviar(fila.id_inscripcion, 'toggle_asistencia', !fila.asistio);
        parchear(fila.id_inscripcion, { asistio: !fila.asistio });
        toast.success(fila.asistio ? 'Asistencia eliminada' : 'Asistencia registrada');
      } catch (error) {
        toast.error(error.message);
      }
    },
    [enviar, parchear],
  );

  const confirmarPago = useCallback(async () => {
    if (!pagoAConfirmar) return;
    setGuardando(true);
    try {
      const data = await enviar(pagoAConfirmar.id_inscripcion, 'toggle_pago', !pagoAConfirmar.pago_completado);
      parchear(pagoAConfirmar.id_inscripcion, {
        pago_completado: !pagoAConfirmar.pago_completado,
        ...(data.estado ? { estado: data.estado } : {}),
      });
      toast.success('Estado de pago actualizado');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setGuardando(false);
      setPagoAConfirmar(null);
    }
  }, [enviar, pagoAConfirmar, parchear]);

  // Mesa o lugar (migración 015): texto corto, null para quitarla.
  const guardarMesa = useCallback(
    async (fila, mesa) => {
      try {
        const data = await enviar(fila.id_inscripcion, 'set_mesa', mesa);
        parchear(fila.id_inscripcion, { mesa: data.mesa ?? null });
        toast.success(data.mesa ? `Mesa asignada: ${data.mesa}` : 'Mesa retirada');
      } catch (error) {
        toast.error(error.message);
      }
    },
    [enviar, parchear],
  );

  return { toggleAsistencia, pagoAConfirmar, setPagoAConfirmar, confirmarPago, guardando, guardarMesa };
}

/**
 * Confirmación del cambio de pago. Es reversible, así que NO usa ConfirmDialog
 * (que siempre advierte "no se puede deshacer"): basta un modal sobrio.
 */
export function ModalConfirmarPago({ marcas }) {
  const { pagoAConfirmar, setPagoAConfirmar, confirmarPago, guardando } = marcas;
  const abierto = Boolean(pagoAConfirmar);
  return (
    <Modal
      isOpen={abierto}
      onClose={() => setPagoAConfirmar(null)}
      title={pagoAConfirmar?.pago_completado ? 'Marcar el pago como pendiente' : 'Confirmar el pago'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => setPagoAConfirmar(null)}>
            Cancelar
          </Button>
          <Button onClick={confirmarPago} loading={guardando}>
            {pagoAConfirmar?.pago_completado ? 'Marcar pendiente' : 'Confirmar pago'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        {abierto
          ? `${pagoAConfirmar.nombre_completo} pasará a “${
              pagoAConfirmar.pago_completado ? 'Pendiente' : 'Pagado'
            }”. Puedes volver a cambiarlo cuando quieras.`
          : ''}
      </p>
    </Modal>
  );
}
