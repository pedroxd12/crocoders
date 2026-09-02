-- 009: Check-in por QR — entrega de playera y asistencia POR PERSONA.
--
-- Motivo: la asistencia vivía sólo en inscripcion_evento.asistio, que para un
-- equipo es UNA fila: escanear el QR del capitán marcaba "asistió" al equipo
-- entero y no había forma de saber quién llegó ni a quién se le entregó su
-- playera. El flujo nuevo del escáner necesita:
--   (a) marcar la entrega de playera del inscrito individual (miembro/invitado),
--   (b) asistencia y entrega de playera por integrante de equipo,
--   (c) lo mismo para los asesores del equipo.
-- inscripcion_evento.asistio se CONSERVA como agregado del equipo (true si al
-- menos un integrante ya llegó); el código del check-in lo mantiene en sync.
--
-- Aditivo e idempotente: sólo ADD COLUMN IF NOT EXISTS con DEFAULT.

BEGIN;

-- (a) Inscripciones individuales (miembro o invitado).
ALTER TABLE inscripcion_evento
  ADD COLUMN IF NOT EXISTS playera_entregada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hora_entrega_playera timestamp without time zone;
COMMENT ON COLUMN inscripcion_evento.playera_entregada IS
  'Sólo para inscripciones de miembro/invitado; en equipos la entrega se lleva por integrante/asesor.';

-- (b) Integrantes de equipo.
ALTER TABLE integrante_equipo
  ADD COLUMN IF NOT EXISTS asistio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hora_asistencia timestamp without time zone,
  ADD COLUMN IF NOT EXISTS playera_entregada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hora_entrega_playera timestamp without time zone;

-- (c) Asesores de equipo (no tienen talla registrada: la entrega se marca igual).
ALTER TABLE asesor_equipo
  ADD COLUMN IF NOT EXISTS asistio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hora_asistencia timestamp without time zone,
  ADD COLUMN IF NOT EXISTS playera_entregada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hora_entrega_playera timestamp without time zone;

COMMIT;
