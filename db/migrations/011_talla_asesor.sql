-- 011: Talla de playera del ASESOR de equipo.
--
-- Motivo: la 009 dejó marcar la entrega de playera a los asesores, pero no
-- había dónde guardar su talla, así que el staff marcaba la entrega sin saber
-- cuál darle. Los integrantes la tienen en su ficha de miembro/invitado; el
-- asesor no es ninguna de las dos cosas (sólo una fila en asesor_equipo), así
-- que la talla vive en esa misma fila.
--
-- El CHECK replica el de miembro/invitado (007). Aditivo e idempotente.

BEGIN;

ALTER TABLE asesor_equipo
  ADD COLUMN IF NOT EXISTS talla_playera character varying(5);

ALTER TABLE asesor_equipo DROP CONSTRAINT IF EXISTS asesor_equipo_talla_playera_check;
ALTER TABLE asesor_equipo ADD CONSTRAINT asesor_equipo_talla_playera_check
  CHECK (talla_playera IS NULL OR talla_playera IN ('XS','S','M','L','XL','XXL','XXXL'));

COMMENT ON COLUMN asesor_equipo.talla_playera IS
  'Talla del asesor cuando el evento entrega playera; los integrantes la llevan en su ficha de miembro/invitado.';

COMMIT;
