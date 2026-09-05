'use client';

import { Check, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';
import { personasDeFila } from '@/lib/asistentes-resumen';
import { ChipTalla } from './columnas';

/**
 * Detalle de un equipo inscrito: integrantes (capitán primero) y asesores,
 * cada uno con su origen, talla, llegada y playera.
 *
 * Antes la fila del equipo sólo decía "3 integrante(s)" y las tallas iban
 * pegadas en un texto: no había forma de saber QUIÉN forma el equipo sin
 * escanear su QR. `fila` es la fila de equipo de la lista de inscritos
 * (null = cerrado).
 */
export default function EquipoModal({ fila, conTalla = false, onClose }) {
  const abierto = Boolean(fila);
  const personas = abierto ? personasDeFila(fila) : [];
  const integrantes = personas.filter((p) => p.rol !== 'asesor').length;
  const asesores = personas.length - integrantes;

  const columnas = [
    {
      header: 'Persona',
      render: (p) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="font-medium">{p.nombre || '—'}</span>
          {p.rol === 'capitan' && <Badge tone="info">Capitán</Badge>}
          {p.rol === 'asesor' && <Badge tone="neutral">Asesor</Badge>}
        </span>
      ),
    },
    { header: 'Correo', accessor: 'correo', cellClassName: 'text-muted' },
    {
      header: 'Origen',
      render: (p) => (
        <span className="text-xs text-muted">
          {p.tipo === 'miembro'
            ? 'Miembro del club'
            : p.tipo === 'asesor'
              ? 'Asesor del equipo'
              : p.institucion
                ? `Invitado · ${p.institucion}`
                : 'Invitado'}
        </span>
      ),
    },
    ...(conTalla
      ? [
          { header: 'Talla', align: 'center', render: (p) => <ChipTalla talla={p.talla_playera} /> },
          {
            header: 'Playera',
            align: 'center',
            render: (p) =>
              p.playera_entregada ? (
                <Badge tone="success">Entregada</Badge>
              ) : (
                <span className="text-xs text-faint">—</span>
              ),
          },
        ]
      : []),
    {
      header: 'Llegó',
      align: 'center',
      render: (p) =>
        p.asistio ? (
          <span className="inline-flex items-center gap-1 text-xs text-brand">
            <Check size={14} aria-hidden="true" />
            Sí
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-faint">
            <X size={14} aria-hidden="true" />
            No
          </span>
        ),
    },
  ];

  return (
    <Modal
      isOpen={abierto}
      onClose={onClose}
      title={fila?.nombre_completo || 'Equipo'}
      size="xl"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {abierto && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {integrantes} {integrantes === 1 ? 'integrante' : 'integrantes'}
            {asesores > 0 && ` · ${asesores} ${asesores === 1 ? 'asesor' : 'asesores'}`}
            {fila.reto_titulo && ` · Desafío: ${fila.reto_titulo}`}
            {fila.mesa && ` · ${fila.mesa}`}
            {fila.correo && ` · Contacto: ${fila.correo}`}
          </p>
          <Table
            columns={columnas}
            data={personas}
            getRowKey={(p) => p.clave}
            emptyMessage="Este equipo no tiene integrantes registrados."
          />
          <p className="text-xs text-faint">
            La llegada y la entrega de playera se marcan por persona desde el escáner QR, con el ticket del equipo.
          </p>
        </div>
      )}
    </Modal>
  );
}
