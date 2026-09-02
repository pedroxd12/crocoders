-- 010: Check-in por QR para PROGRAMAS — entrega de playera por inscripción.
--
-- Motivo: los programas ya piden talla (007, programa_recurrente.solicitar_talla)
-- pero no había dónde registrar que la playera se entregó. La asistencia de
-- programas ya es por sesión (asistencia_miembro/asistencia_invitado, con
-- UNIQUE por sesión+persona), así que ahí no falta nada; la playera en cambio
-- se entrega UNA vez por participante en todo el programa, igual que en las
-- inscripciones individuales de evento (ver 009).
--
-- Aditivo e idempotente.

BEGIN;

ALTER TABLE inscripcion_programa
  ADD COLUMN IF NOT EXISTS playera_entregada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hora_entrega_playera timestamp without time zone;
COMMENT ON COLUMN inscripcion_programa.playera_entregada IS
  'Entrega única por participante en todo el programa; se marca desde el escáner QR de una sesión.';

COMMIT;
